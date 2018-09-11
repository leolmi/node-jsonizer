'use strict';
const _ = require('lodash');

const Options = function(info) {
  this.pretasks = [];
  if (info)
    _.extend(this, info);
};

Options.prototype = {
  type: '',
  pattern: '',
  pretasks: null
};

exports.instance = Options;
