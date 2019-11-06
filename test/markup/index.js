'use strict';

const _        = require('lodash');
const fs       = require('fs').promises;
const glob     = require('glob');
const hljs     = require('../../build');
const path     = require('path');
const utility  = require('../utility');

function splitLines(input) {
  let result = [];
  let lines = input.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i < lines.length - 1) {
      result.push(lines[i] + '\n');
    } else if (lines[i] != '') {
      result.push(lines[i]);
    }
  }
  return result;
}

function normalizeSpans(input) {
  // When marking up an input line-by-line, elements which span multiple lines
  // will be divided up into several spans. For instance, a multi-line C++
  // comment may be marked up as:
  //
  //   <span class="hljs-comment">/*</span>
  //   <span class="hljs-comment">Hello</span>
  //   <span class="hljs-comment">*/</span>
  //
  // whereas that same comment, when passed into hljs.highlight() in one call,
  // will be marked up as a single span. To reuse test expectations, we convert
  // the expectation to the expected form.
  const spanTagRe = /<\/?span[^>]*>/g;
  let result = '';
  let spanStack = [];
  let deferredCloses = 0;
  let flushDeferredCloses = function() {
    for (let i = 0; i < deferredCloses; i++) {
      result += '</span>';
      spanStack.pop();
    }
    deferredCloses = 0;
  };
  let lastIndex = 0;
  for (const tag of input.matchAll(spanTagRe)) {
    if (tag.index > lastIndex) {
      flushDeferredCloses();
      result += input.substring(lastIndex, tag.index);
    }
    if (tag[0].startsWith('</')) {
      deferredCloses++;
    } else if (deferredCloses > 0 &&
               spanStack[spanStack.length - deferredCloses] == tag[0]) {
      deferredCloses--;
    } else {
      flushDeferredCloses();
      result += tag[0];
      spanStack.push(tag[0]);
    }
    lastIndex = tag.index + tag[0].length;
  }
  flushDeferredCloses();
  result += input.substring(lastIndex);
  return result;
}

// These don't work because one of the begin or end blocks matches a newline.
const lineByLineExceptions = {
  'cpp': ['string-literals'],
  'crystal': ['literals', 'operators'],
  'cs': ['functions', 'titles'],
  'dart': ['comment-markdown'],
  'dockerfile': ['default'],
  'http': ['default'],
  'javascript': ['arrow-function', 'inline-languages', 'object-attr'],
  'lisp': ['mec'],
  'matlab': ['block_comment'],
  'properties': ['syntax'],
  'reasonml': ['functions', 'modules'],
  'ruby': ['heredoc'],
  'rust': ['strings'],
  'typescript': ['inline-languages'],
  'vim': ['strings-comments'],
  'yaml': ['block', 'string'],
};

function testLanguage(language) {
  describe(language, function() {
    const filePath  = utility.buildPath('markup', language, '*.expect.txt'),
          filenames = glob.sync(filePath);
    const exceptions = lineByLineExceptions[language] || [];

    _.each(filenames, function(filename) {
      const testName   = path.basename(filename, '.expect.txt'),
            sourceName = filename.replace(/\.expect/, '');

      it(`should markup ${testName}`, function(done) {
        const sourceFile   = fs.readFile(sourceName, 'utf-8'),
              expectedFile = fs.readFile(filename, 'utf-8');

        Promise.all([sourceFile, expectedFile]).then(function([source, expected]) {
          const actual = hljs.highlight(language, source).value;

          actual.trim().should.equal(expected.trim());
          done();
        }).catch(function(err) { return done(err) });
      });

      it(`should markup ${testName} line by line`, function(done) {
        if (exceptions.indexOf(testName) >= 0) {
          done();
          return;
        }

        const sourceFile   = fs.readFile(sourceName, 'utf-8'),
              expectedFile = fs.readFile(filename, 'utf-8');
        Promise.all([sourceFile, expectedFile]).then(function([source, expected]) {
          const lines = splitLines(source);
          let continuation = null;
          let actual = '';
          _.each(lines, function(line) {
            const result = hljs.highlight(language, line, false, continuation);
            actual += result.value;
            continuation = result.top;
          });

          normalizeSpans(actual).trim().should.equal(normalizeSpans(expected).trim());
          done();
        }).catch(function(err) { return done(err) });
      });
    });
  });
}

describe('hljs.highlight()', async () => {
  // TODO: why?
  // ./node_modules/.bin/mocha test/markup
  it("needs this or it can't be run stand-alone", function() {} );

  const markupPath = utility.buildPath('markup');

  const languages = await fs.readdir(markupPath)
  return languages.forEach(testLanguage);
});
