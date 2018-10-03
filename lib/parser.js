/* Created by Leo on 26/04/2016. */
'use strict';

const _ = require('lodash');
const proto = require('./proto');
const cheerio = require('cheerio');
const xmlparser = require('fast-xml-parser');

exports.types = [{
  name: 'htmltable',
  desc: 'Html table parser'
}, {
  name: 'json',
  desc: 'Json data parser'
}, {
  name: 'xml',
  desc: 'Xml data parser'
}, {
  name: 'custom',
  desc: 'Custom data parser'
}];


function _execTasks(tasks, content) {
  if (tasks.length>0) {
    tasks.forEach((t) => {
      try {
        content = eval(t.pattern);
      } catch(err) {
        console.log('TASK = ' + JSON.stringify(t) + '  ERROR: '+ JSON.stringify(err));
      }
    });
  }
  return content;
}

function parseHtmlTable(html, options, cb) {
  try {
    const table = [];
    const $ = cheerio.load(html);
    const res = eval(options.pattern);
    res.find('tr').each(() => {
      const row = {};
      $(this).children().each((i, e) => row['C' + i] = $(e).text());
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
    let res = content;
    const data = JSON.parse(res);
    if (options.pattern) {
      res = eval(options.pattern);
      if (res && !_.isArray(res)) {
        res = JSON.stringify(res);
      }
    } else {
      res = JSON.stringify(data);
    }
    return cb(null, res);
  } catch(err) {
    return cb(err);
  }
}
exports.parseJsonContent = parseJsonContent;

function parseXmlContent(content, options, cb) {
  try {
    let res = content;
    const data = xmlparser.parse(content);
    if (options.pattern) {
      res = eval(options.pattern);
      if (res && !_.isArray(res)) {
        res = JSON.stringify(res);
      }
    } else {
      res = JSON.stringify(data);
    }
    return cb(null, res);
  } catch(err) {
    return cb(err);
  }
}
exports.parseXmlContent = parseXmlContent;

function parseCustomContent(content, options, cb) {
  try {
    const res = options.pattern ? eval(options.pattern) : content;
    return cb(null, res);
  } catch(err) {
    return cb(err);
  }
}
exports.parseCustomContent = parseCustomContent;


const _parsers = {
  htmltable: parseHtmlTable,
  json: parseJsonContent,
  xml: parseXmlContent,
  custom: parseCustomContent
};

function parse(content, o, cb){
  //console.log('[PARSER] - start');
  cb = cb || _.noop;
  const options = proto.parserOptions(o);
  //console.log('[PARSER] - pretasks');
  try {
    content = _execTasks(options.pretasks, content);
  } catch(err) {
    return cb(err);
  }

  const parser = _parsers[options.type];
  return (!parser) ? cb(null, content) : parser(content, options, cb);
}
exports.parse = parse;
