const _ = require('lodash');

const CONSTANTS = {
  contentType: {
    auto: 'auto',
    json: 'json',
    xml: 'xml',
    html: 'html',
    custom: 'custom'
  }
};

exports.constants = CONSTANTS;

/**
 * Sequence item object
 * @param info
 * @constructor
 */
const SequenceItem = function(info) {
  this.title = 'sequence item';
  this.data = null;
  this.datatype = null;
  if (_.isObject(info)) _.extend(this, info);
};
SequenceItem.prototype = {

};
exports.sequenceItem = (i) => new SequenceItem(i);

/**
 * Sequence object
 * @param info
 * @constructor
 */
const Sequence = function(info) {
  this.SSL = false;
  this.proxy = false;
  this.jsutil = '';
  if (_.isObject(info)) _.extend(this, info);

  this.items = _.map(this.items || [], (i) => new SequenceItem(i));
  this.parameters = this.parameters || [];
};
Sequence.prototype = {

};
exports.sequence = (i) => new Sequence(i);

/**
 * Options for parser
 * @param info
 * @constructor
 */
const ParserOptions = function(info) {
  this.type = CONSTANTS.contentType.json;
  this.pattern = '';
  if (_.isObject(info)) _.extend(this, info);
  this.pretasks = this.pretasks || [];
};
ParserOptions.prototype = {

};
exports.parserOptions = (i) => new ParserOptions(i);

/**
 * Options for web
 * @param info
 * @constructor
 */
const WebOptions = function(info) {
  this.https = false;
  this.proxy = false;
  this.verbose = false;
  if (_.isObject(info)) _.extend(this, info);
  this.headers = this.headers || {};
};
WebOptions.prototype = {

};
exports.webOptions = (i) => new WebOptions(i);

/**
 *
 * @param info
 * @constructor
 */
const ResultData = function (info) {
  this.type = 'none';
  this.data = null;
  this.content = '';
  if (_.isObject(info)) _.extend(this, info);
};
ResultData.prototype = {

};
exports.resultData = (i) => new ResultData(i);
