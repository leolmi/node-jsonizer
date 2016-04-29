/* Created by Leo on 28/04/2016. */
'use strict';
var _ = require('lodash');

var Options = function(info) {
  if (info)
    _.extend(this, info);
};

Options.prototype = {
  type: '',
  pattern: '',
  pretasks: []
};

exports.instance = Options;
