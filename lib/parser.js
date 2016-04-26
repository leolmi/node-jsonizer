/* Created by Leo on 26/04/2016. */
'use strict';

var _ = require('lodash');
var cheerio = require("cheerio");


function parseHtmlTable(html, pattern, cb) {
  try {
    var table = [];
    var $ = cheerio.load(html);
    var res = eval(pattern);
    res.find('tr').each(function () {
      var row = {};
      $(this).children().each(function (i, e) {
        row['C' + i] = $(e).text();
      });
      table.push(row);
    });
    return cb(null, table);
  }
  catch(err) {
    return cb(err);
  }
}
exports.parseHtmlTable = parseHtmlTable;

function parse(content, options, cb){
  cb = cb || noop;
  options = options || {};
  var type = options.type || 'none';
  switch (type){
    //PARSER HTML
    case 'htmltable':
      return parseHtmlTable(content, options.pattern, cb);

    //CUSTOM PARSER
    case 'custom':
      if (_.isFunction(options.parse))
        return options.parse(content, cb);
      return cb(new Error('Custom parser not defined!'));

    //DEFAULT: restituisce il testo così come è stato recuperato
    default:
      return cb(null, content);
  }
}

exports.parse = parse;
