/**
 * Copyright 2018 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const cheerio = require('cheerio');

const FORMATS = ['websites', 'stories', 'ads', 'email'];

const FILTER_CLASSES = {
  'websites': 'ap--websites',
  'stories': 'ap--stories',
  'ads': 'ap--ads',
  'email': 'ap--email',
};

const FILTERED_ROUTES = [
  /\/documentation\/guides-and-tutorials.*/,
  /\/documentation\/components.*/,
  /\/documentation\/examples.*/,
];

function isFilterableRoute(route) {
  let filterableRoute = false;
  for (const expression of FILTERED_ROUTES) {
    if (expression.test(route)) {
      filterableRoute = true;
      break;
    }
  }

  return filterableRoute;
}

class FilteredPage {
  /**
   * @param {String} format  One of FORMATS
   * @param {String} content A valid HTML document string
   * @param {Boolean} force  Flag if format should be validated
   */
  constructor(format, content, force) {
    this._format = format;
    this._content = content;

    this._dom = cheerio.load(this._content);
    if (!this._isAvailable() && !force) {
      throw new Error(`This page is not available for format ${this._format}`);
    } else {
      this._removeHiddenElements();
      this._rewriteUrls();
      this._setActiveFormatToggle();
      this._removeStaleFilterClass();
      this._removeEmptyFilterBubbles();
      this._addClassToBody();
    }
  }

  /**
   * Checks if the constructed one is a actually valid format variant
   * @return {Boolean}
   */
  _isAvailable() {
    const body = this._dom('body');
    return (body.attr('data-available-formats') || '').includes(this._format);
  }

  /**
   * Adds a class to the <body> element that marks the current filtered format
   * to be able to apply styles based on filter
   * @return {undefined}
   */
  _addClassToBody() {
    this._dom('body').addClass(FILTER_CLASSES[this._format]);
  }

  /**
   * Tries to remove all elements that would otherwise be hidden by CSS
   * and then checks for empty lists afterwards
   * @return {undefined}
   */
  _removeHiddenElements() {
    let inactiveFormatClasses = Object.assign({}, FILTER_CLASSES);
    delete inactiveFormatClasses[this._format];
    inactiveFormatClasses = Object.values(inactiveFormatClasses);
    inactiveFormatClasses = '.' + inactiveFormatClasses.join(', .');

    const activeFormatClass = FILTER_CLASSES[this._format];

    // Find all hidden elements and remove them if they aren't matching
    // the current filter
    this._dom(inactiveFormatClasses).each((index, filteredElement) => {
      filteredElement = this._dom(filteredElement);

      // Check if the filtered element is also valid for the current format
      if (filteredElement.hasClass(activeFormatClass)) {
        return;
      }

      filteredElement.remove();
    });

    // Find possibly empty lists and remove them from sidebars
    this._dom('.nav-list.level-2')
        .each((index, navList) => {
          navList = this._dom(navList);

          if (navList.children().length == 0) {
            navList.parent().remove();
          }
        });

    // Remove empty top level categories from sidebar
    this._dom('.nav-item.level-1')
        .each((index, navItem) => {
          navItem = this._dom(navItem);

          // ... consider a category empty if there are no links in it
          if (!navItem.has('a').length) {
            navItem.remove();
          }
        });

    // Remove eventually unnecessary tutorial dividers left by the
    // previous transformation
    this._dom('.nav-item-tutorial-divider:last-child,' +
        '.nav-item-tutorial-divider:first-child').remove();
  }

  /**
   * Appends the currently active filter to all of the links
   * on the page
   * @return {undefined}
   */
  _rewriteUrls() {
    this._dom('a').each((index, a) => {
      a = this._dom(a);
      const href = a.attr('href') || '';
      // Check if the link is pointing to a filtered route
      // and if the link already has a query parameter
      if (!href.includes('?') && isFilterableRoute(href)) {
        a.attr('href', `${href}?format=${this._format}`);
      }
    });
  }

  _setActiveFormatToggle() {
    // Rewrite the active state (which is websites per default) to
    // the current active format
    const activeFormat = this._dom('.ap-m-format-toggle-selected');
    if (activeFormat.length == 0) {
      console.error('Page has no active format.');
      return;
    }

    activeFormat.html(activeFormat.html().replace(/websites/g, this._format));
    activeFormat.removeClass('ap-m-format-toggle-link-websites');
    activeFormat.addClass(`ap-m-format-toggle-link-${this._format}`);

    // Remove the current format from list of available ones
    this._dom(`a.ap-m-format-toggle-link-${this._format}`).remove();
  }

  /**
   * Remove the unneeded filter classes on the elements as they are not needed
   * anymore after static filtering has been applied
   * @return {undefined}
   */
  _removeStaleFilterClass() {
    let filteredElementsSelector = Object.values(FILTER_CLASSES);
    filteredElementsSelector = '.' + filteredElementsSelector.join(', .');

    const filterClasses = Object.values(FILTER_CLASSES).join(' ');

    this._dom(filteredElementsSelector).each((index, filteredElement) => {
      filteredElement = this._dom(filteredElement);

      filteredElement.removeClass(filterClasses);
    });
  }

  /**
   * Checks if there are filter bubbles on the page and checks for possible
   * matches for their filter, then removes them if there are none
   * @return {undefined}
   */
  _removeEmptyFilterBubbles() {
    this._dom('.ap-m-filter-bubble').each((index, filterBubble) => {
      filterBubble = this._dom(filterBubble);
      const category = filterBubble.data('category');
      if (!this._dom(`.ap-m-teaser[data-category="${category}"]`).length) {
        filterBubble.remove();
      }
    });
  }

  get content() {
    let content = this._dom.html();

    // As cheerio has problems with XML syntax in HTML documents the
    // markup for the icons needs to be restored
    content = content.replace('xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink"',
        'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"');
    content = content.replace(/xlink="http:\/\/www\.w3\.org\/1999\/xlink" href=/gm,
        'xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href=');

    return content;
  }
}

module.exports.FilteredPage = FilteredPage;
module.exports.isFilterableRoute = isFilterableRoute;
module.exports.FORMATS = FORMATS;
