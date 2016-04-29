/* Created by Leo on 26/04/2016. */
'use strict';

var _ = require('lodash');
var Options = require('./options');
var cheerio = require("cheerio");

exports.types = [{
  name: 'htmltable',
  desc: 'Html table parser'
}, {
  name: 'json',
  desc: 'Json data parser'
}, {
  name: 'custom',
  desc: 'Custom data parser'
}];


function execTasks(tasks, content) {
  if (tasks.length>0) {
    tasks.forEach(function (t) {
      try {
        var data = content;
        content = eval(t.pattern);
      }
      catch(err) {
        console.log('TASK = ' + JSON.stringify(t) + '  ERROR: '+ JSON.stringify(err));
      }
    });
  }
  return content;
}

function parseHtmlTable(html, options, cb) {
  try {
    var table = [];
    var $ = cheerio.load(html);
    var res = eval(options.pattern);
    res.find('tr').each(function () {
      var row = {};
      $(this).children().each(function (i, e) {
        row['C' + i] = $(e).text();
      });
      table.push(row);
    });
    return cb(null, table);
  } catch(err) {
    return cb(err);
  }
}
exports.parseHtmlTable = parseHtmlTable;

function parseJsonContent(content, options, cb) {
  try {
    var res = content;
    if (options.pattern) {
      var data = JSON.parse(res);
      res = eval(options.pattern);
      if (res && !_.isArray(res)) {
        res = JSON.stringify(res);
      }
    }
    return cb(null, res);
  } catch(err) {
    return cb(err);
  }
}
exports.parseJsonContent = parseJsonContent;

function parseCustomContent(content, options, cb) {
  try {
    var res = content;
    if (options.pattern) {
      var data = content;
      res = eval(options.pattern);
    }
    return cb(null, res);
  } catch(err) {
    return cb(err);
  }
}
exports.parseCustomContent = parseCustomContent;


function parse(content, options, cb){
  cb = cb || noop;
  options = new Options.instance(options);

  try {
    content = execTasks(options.pretasks, content);
  }
  catch(err) {
    return cb(err);
  }

  switch (options.type){
    //PARSER HTML
    case 'htmltable':
      return parseHtmlTable(content, options, cb);
    //PARSER JSON
    case 'json':
      return parseJsonContent(content, options, cb);
    //CUSTOM PARSER
    case 'custom':
      return parseCustomContent(content, options, cb);

    //DEFAULT: restituisce il testo così come è stato recuperato
    default:
      return cb(null, content);
  }
}

exports.parse = parse;
