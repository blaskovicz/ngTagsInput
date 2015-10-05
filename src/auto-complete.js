'use strict';

/**
 * @ngdoc directive
 * @name autoComplete
 * @module ngTagsInput
 *
 * @description
 * Provides autocomplete support for the tagsInput directive.
 *
 * @param {expression} source Expression to evaluate upon changing the input content. The input value is available as
 *                            $query. The result of the expression must be a promise that eventually resolves to an
 *                            array of strings.
 * @param {number=} [debounceDelay=100] Amount of time, in milliseconds, to wait before evaluating the expression in
 *                                      the source option after the last keystroke.
 * @param {number=} [minLength=3] Minimum number of characters that must be entered before evaluating the expression
 *                                 in the source option.
 * @param {boolean=} [highlightMatchedText=true] Flag indicating that the matched text will be highlighted in the
 *                                               suggestions list.
 * @param {number=} [maxResultsToShow=10] Maximum number of results to be displayed at a time.
 * @param {boolean=} [loadOnDownArrow=false] Flag indicating that the source option will be evaluated when the down arrow
 *                                           key is pressed and the suggestion list is closed. The current input value
 *                                           is available as $query.
 * @param {boolean=} {loadOnEmpty=false} Flag indicating that the source option will be evaluated when the input content
 *                                       becomes empty. The $query variable will be passed to the expression as an empty string.
 * @param {boolean=} {loadOnFocus=false} Flag indicating that the source option will be evaluated when the input element
 *                                       gains focus. The current input value is available as $query.
 * @param {boolean=} [selectFirstMatch=true] Flag indicating that the first match will be automatically selected once
 *                                           the suggestion list is shown.
 * @param {boolean=} [truncateTagText=true] Flag indicating if we should truncate displayed tag text programatically.
 * @param {number=} [truncateToChars=200] Maximum number of characters to display in an autocomplete row. If a tag is
 *                                        truncated, this count will include the ellipsis.
 * @param {boolean=} [truncateBeginning=true] Flag indicating if we should truncate the tag text in the beginning (true)
 *                                            or at the end (false). This is only used if truncateTagText is true.
 */
tagsInput.directive('autoComplete', function($document, $timeout, $sce, $q, tagsInputConfig, tiUtil) {
    function SuggestionList(loadFn, options) {
        var self = {}, getDifference, lastPromise;

        getDifference = function(array1, array2) {
            return array1.filter(function(item) {
                return !tiUtil.findInObjectArray(array2, item, options.tagsInput.displayProperty);
            });
        };

        self.reset = function() {
            lastPromise = null;

            self.page = 1;
            self.allItems = [];
            self.items = [];
            self.visible = false;
            self.index = -1;
            self.selected = null;
            self.query = null;
        };
        self.show = function() {
            if (options.selectFirstMatch) {
                self.select(0);
            }
            else {
                self.selected = null;
            }
            self.visible = true;
        };
        self.load = tiUtil.debounce(function(query, tags) {
            self.query = query;

            var promise = $q.when(loadFn({ $query: query }));
            lastPromise = promise;

            promise.then(function(items) {
                if (promise !== lastPromise) {
                    return;
                }

                items = tiUtil.makeObjectArray(items.data || items, options.tagsInput.displayProperty);
                self.allItems = getDifference(items, tags);
                self.setPage(1);

                if (self.items.length > 0) {
                    self.show();
                }
                else {
                    self.reset();
                }
            });
        }, options.debounceDelay);

        self.selectNext = function() {
            self.select(++self.index);
        };
        self.selectPrior = function() {
            self.select(--self.index);
        };
        self.select = function(index) {
            if (index < 0) {
                index = self.items.length - 1;
            }
            else if (index >= self.items.length) {
                index = 0;
            }
            self.index = index;
            self.selected = self.items[index];
        };
        self.headerText = function() {
            if(self.items.length === 0) {
                return 'No items';
            }
            var startIndex = 1 + self.currentItemStartIndex();
            var endIndex = startIndex + self.items.length - 1;
            var itemPlural = 'item' + (self.items.length !== 1 ? 's' : '');
            var rangeText = startIndex === endIndex ? startIndex : (startIndex + ' - ' + endIndex);
            return 'Showing ' + itemPlural + ' ' + rangeText + ' of ' + self.allItems.length;
        };

        self.firstPage = function() {
            if(self.page === 1) {
                return;
            }
            self.setPage(1);
        };
        self.lastPage = function() {
            if(self.page === self.numberOfPages()) {
                return;
            }
            self.setPage(self.numberOfPages());
        };
        self.previousPage = function() {
            if(self.disablePrevious()) {
                return;
            }
            self.setPage(self.page - 1);
        };
        self.nextPage = function() {
            if(self.disableNext()) {
                return;
            }
            self.setPage(self.page + 1);
        };
        self.numberOfPages = function() {
            return Math.ceil(self.allItems.length / options.maxResultsToShow);
        };
        self.hasMorePages = function() {
            return self.numberOfPages() > self.page;
        };
        self.hasPreviousPages = function() {
            return self.page > 1;
        };
        self.currentItemStartIndex = function() {
            return (self.page - 1) * options.maxResultsToShow;
        };
        self.setPage = function(page) {
            self.page = page;
            var startIndex = self.currentItemStartIndex();
            self.items = self.allItems.slice(startIndex, startIndex + options.maxResultsToShow);
        };
        self.disableFirst = function() {
            return self.page === 1;
        };
        self.disableLast = function() {
            return self.page === self.numberOfPages();
        };
        self.disablePrevious = function() {
            return !self.hasPreviousPages();
        };
        self.disableNext = function() {
            return !self.hasMorePages();
        };

        self.reset();

        return self;
    }

    return {
        restrict: 'E',
        require: '^tagsInput',
        scope: { source: '&' },
        templateUrl: 'ngTagsInput/auto-complete.html',
        link: function(scope, element, attrs, tagsInputCtrl) {
            var hotkeys = [KEYS.enter, KEYS.tab, KEYS.escape, KEYS.up, KEYS.down],
                suggestionList, tagsInput, options, getItem, getDisplayText, shouldLoadSuggestions;

            tagsInputConfig.load('autoComplete', scope, attrs, {
                debounceDelay: [Number, 100],
                minLength: [Number, 3],
                highlightMatchedText: [Boolean, true],
                maxResultsToShow: [Number, 10],
                loadOnDownArrow: [Boolean, false],
                loadOnEmpty: [Boolean, false],
                loadOnFocus: [Boolean, false],
                selectFirstMatch: [Boolean, true],
                truncateTagText: [Boolean, true],
                truncateToChars: [Number, 200],
                truncateBeginning: [Boolean, true]
            });

            options = scope.options;

            tagsInput = tagsInputCtrl.registerAutocomplete();
            options.tagsInput = tagsInput.getOptions();

            suggestionList = new SuggestionList(scope.source, options);

            getItem = function(item) {
                return item[options.tagsInput.displayProperty];
            };

            getDisplayText = function(item) {
                return tiUtil.safeToString(getItem(item));
            };

            shouldLoadSuggestions = function(value) {
                return value && value.length >= options.minLength || !value && options.loadOnEmpty;
            };

            scope.suggestionList = suggestionList;

            scope.addSuggestionByIndex = function(index) {
                suggestionList.select(index);
                scope.addSuggestion();
            };

            scope.addSuggestion = function() {
                var added = false;

                if (suggestionList.selected) {
                    tagsInput.addTag(suggestionList.selected);
                    suggestionList.reset();
                    tagsInput.focusInput();

                    added = true;
                }
                return added;
            };

            scope.getTitleText = function(item) {
              return getDisplayText(item);
            };

            scope.getDisplayText = function(item) {
                var text = getDisplayText(item);
                var textLength = text.length;
                // truncate tag text
                if (options.truncateTagText && textLength > options.truncateToChars) {
                  // beginning truncate: eg. ("foobar", 3) -> "...bar"
                  if (options.truncateBeginning) {
                    text = '...' + text.substr(textLength - options.truncateToChars + 3);
                  }
                  // end truncate: eg. ("foobar", 3) -> "foo..."
                  else {
                    text = text.substr(0, options.truncateToChars - 3) + '...';
                  }
                }
                text = tiUtil.encodeHTML(text);
                // highlight tag text
                if (options.highlightMatchedText) {
                    text = tiUtil.safeHighlight(text, tiUtil.encodeHTML(suggestionList.query));
                }
                return $sce.trustAsHtml(text);
            };

            scope.track = function(item) {
                return getItem(item);
            };

            tagsInput
                .on('tag-added invalid-tag input-blur', function() {
                    suggestionList.reset();
                })
                .on('input-change', function(value) {
                    if (shouldLoadSuggestions(value)) {
                        suggestionList.load(value, tagsInput.getTags());
                    }
                    else {
                        suggestionList.reset();
                    }
                })
                .on('input-focus', function() {
                    var value = tagsInput.getCurrentTagText();
                    if (options.loadOnFocus && shouldLoadSuggestions(value)) {
                        suggestionList.load(value, tagsInput.getTags());
                    }
                })
                .on('input-keydown', function(event) {
                    var key = event.keyCode,
                        handled = false;

                    if (hotkeys.indexOf(key) === -1) {
                        return;
                    }

                    if (suggestionList.visible) {

                        if (key === KEYS.down) {
                            suggestionList.selectNext();
                            handled = true;
                        }
                        else if (key === KEYS.up) {
                            suggestionList.selectPrior();
                            handled = true;
                        }
                        else if (key === KEYS.escape) {
                            suggestionList.reset();
                            handled = true;
                        }
                        else if (key === KEYS.enter || key === KEYS.tab) {
                            handled = scope.addSuggestion();
                        }
                    }
                    else {
                        if (key === KEYS.down && scope.options.loadOnDownArrow) {
                            suggestionList.load(tagsInput.getCurrentTagText(), tagsInput.getTags());
                            handled = true;
                        }
                    }

                    if (handled) {
                        event.preventDefault();
                        event.stopImmediatePropagation();
                        return false;
                    }
                });
        }
    };
});
