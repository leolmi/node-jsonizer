/*
 * jsonizer
 * Copyright 2015
 * Authors: Leo Olmi.
 * All Rights Reserved.
 * Use, reproduction, distribution, and modification of this code is subject to the terms and
 * conditions of the MIT license, available at http://www.opensource.org/licenses/mit-license.php
 *
 * Project: https://github.com/leolmi/node-jsonizer
 */

const _ = require('lodash'),
  u = require('./lib/utils'),
  proto = require('./lib/proto'),
  parser = require('./lib/parser'),
  https = require('https'),
  http = require('http'),
  URL = require('url'),
  querystring = require('querystring'),
  zlib = require("zlib");

const CONSTANTS = {
  headers: {
    defaults: {
      "Content-Type": "text/html; charset=utf-8",
      "Connection": "keep-alive",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "it,en;q=0.9,it-IT;q=0.8,en-US;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
    },
    contentTpes: {
      json: "application/json",
      text: "text/html; charset=utf-8"
    }
  },
  dataType: {
    multipart: 'multipart'
  },
  prefixes: {
    js: 'JS=',
    rgx: 'RGX='
  },
  multipart_boundary_prefix: '---------------------------',
  multipart_body_header: 'Content-Disposition: form-data; name='
};

'use strict';
const jsonizer = function() {

  const opt_prototype = {
    timeout: 150000,
    headers: {}
  };

  const _keepers = [
    {name: '__VIEWSTATE', pattern: '<input.*?name="__VIEWSTATE".*?value="(.*?)".*?>'},
    {name: '__VIEWSTATEGENERATOR', pattern: '<input.*?name="__VIEWSTATEGENERATOR".*?value="(.*?)".*?>'},
    {name: '__EVENTVALIDATION', pattern: '<input.*?name="__EVENTVALIDATION".*?value="(.*?)".*?>'}
  ];


  const _eval = {
    javascript(logic, arg, util) {
      if (util) logic = util + '\n\n' + logic;
      const f = new Function('data', '_', logic);
      return f(arg, _, util);
    },
    regex(logic, arg) {
      const rgx = new RegExp(logic);
      return rgx.exec(arg);
    },
    bypass(logic, arg) {
      return arg;
    }
  };

  function _getData(sequence, data) {
    if (data && _.isArray(data) && data.length > 0) {
      let eo = {};
      data.forEach((item) => {
        if (_.isFunction(item.value.indexOf) && item.value.indexOf(CONSTANTS.prefixes.js) === 0) {
          const logic = item.value.substr(CONSTANTS.prefixes.js.length);
          eo[item.name] = _eval.javascript(logic, null, sequence.jsutil);
        } else {
          eo[item.name] = item.value;
        }
      });
      return querystring.stringify(eo);
    }
    return undefined;
  }

  function _getMultipartData(o, data) {
    let body = undefined;
    if (data && _.isArray(data) && data.length > 0) {
      const id = u.uuid();
      const boundary = CONSTANTS.multipart_boundary_prefix + id;
      body = '';
      data.forEach((item) => body += '--' + boundary + '\r\n' + CONSTANTS.multipart_body_header + '"' + item.name + '"\r\n\r\n' + item.value + '\r\n');
      body += '--' + boundary + '--';

      if (o.headers['content-type'])
        o.headers['content-type'] += ' boundary=' + boundary;
    }
    return body;
  }

  function _getItemData(sequence, item, wo) {
    switch (item.datatype) {
      case CONSTANTS.dataType.multipart:
        return _getMultipartData(wo, item.data);
      default:
        return _getData(sequence, item.data);
    }
  }

  function _getRedirectPath(o, nxt) {
    const prev = o.path.split('/');
    const next = nxt.split('/');
    if (o.verbose) console.log('[REDIRECT]: prv=' + o.path + '   prev=' + JSON.stringify(prev));
    if (o.verbose) console.log('[REDIRECT]: nxt=' + nxt + '   next=' + JSON.stringify(next));

    if (prev.length) prev.pop();
    while (next.length && next[0] === '..') {
      next.splice(0, 1);
      prev.pop();
    }

    prev.push.apply(prev, next);

    nxt = prev.join('/');
    if (o.verbose) console.log('[REDIRECT]: res=' + nxt + '   result=' + JSON.stringify(prev));
    return nxt;
  }

  function _checkCookies(res, o) {
    if (_.has(res.headers, 'set-cookie'))
      o.headers.cookie = res.headers['set-cookie'];
  }

  /**
   * Richiesta
   * @param title
   * @param options
   * @param data
   * @param target
   * @param cb
   */
  function _doRequest(title, options, data, target, cb) {
    let skipped = false;
    let download = false;
    cb = cb || _.noop;
    if (options.verbose) console.log('[' + title + ']-OPTIONS: ' + JSON.stringify(options, null, 2));
    options.agent = false;
    let handler = options.https ? https : http;
    const protocol = options.https ? 'https://' : 'http://';

    const req_opt = {
      path: protocol + options.host + options.path,
      method: options.method,
      headers: options.headers,
      host: options.host
    };


    if (options.proxy) {
      const prt_name = options.https ? 'HTTPS_PROXY' : 'HTTP_PROXY';
      const proxy_env = process.env.JSONIZER_PROXY || process.env[prt_name];
      if (proxy_env) {
        const proxy = URL.parse(proxy_env);
        req_opt.host = proxy.hostname;
        req_opt.port = proxy.port;
        handler = ((proxy.protocol || '').indexOf('https') === 0) ? https : http;
      }
    }

    if (options.verbose) console.log('[' + title + ']-REQ OPT: ' + JSON.stringify(req_opt, null, 2));

    const req = handler.request(req_opt, (res) => {
      const result = {
        code: res.statusCode,
        headers: res.headers
      };
      if (options.verbose) console.log('[' + title + ']-RESULTS: ' + JSON.stringify(result, null, 2));
      _checkCookies(res, options);

      const newpath = res.headers.location;
      if ((res.statusCode.toString() === '302' || res.statusCode.toString() === '301') && newpath) {
        skipped = true;
        if (options.verbose) console.log('new location:' + newpath);
        const path = _getRedirectPath(options, newpath);
        if (path === options.path) {
          console.warn('Location is the same!');
          return;
        }
        if (!path || path.split(options.host).length > 2) {
          const msg = 'WARINNG: Wrong path: ' + path;
          console.error(msg);
          return;
        }
        options.path = path;
        if (options.verbose) console.log('Redir new path:' + options.path);
        _checkCookies(res, options);

        _doRequest('redir - ' + title, options, null, null, cb);
      }

      if (target) {
        download = true;
        res.setEncoding('binary');
        res.pipe(target);
        target.on('finish', () => {
          if (options.verbose) console.log('Write file ended!');
          target.close(cb(null, options, result));
        });
      }

      const chunks = [];
      let content = '';

      res.on('data', (chunk) => {
        const type = _.isString(chunk) ? 'stringa' : 'altro';
        if (options.verbose) console.log('[' + title + ']-download data (' + type + '): ' + chunk);
        content += chunk;
        chunks.push(chunk);
      });

      res.on('end', () => {
        if (options.verbose) console.log('[' + title + ']-Fine richiesta!   skipped=' + skipped + '   download=' + download + '  target=' + (target ? 'si' : 'no'));
        if (!skipped && !target && !download) {
          options.headers = _.merge(options.headers, req.headers);
          const buffer = Buffer.concat(chunks);

          const encoding = res.headers['content-encoding'];
          if (encoding === 'gzip') {
            zlib.gunzip(buffer, (err, decoded) => cb(err, options, result, decoded && decoded.toString()));
          } else if (encoding === 'deflate') {
            zlib.inflate(buffer, (err, decoded) => cb(err, options, result, decoded && decoded.toString()));
          } else {
            cb(null, options, result, buffer.toString());
          }
        }
      });
    });

    req.on('error', function (e) {
      if (options.verbose) console.log('[' + title + ']-problem with request: ' + JSON.stringify(e));
      cb(e);
    });

    if (data) {
      if (options.verbose) console.log('[' + title + ']-send data: ' + data);
      req.write(data);
    }

    if (options.timeout) {
      req.setTimeout(options.timeout, function () {
        cb('request timed out');
      });
    }

    req.end();
  }

  function _getUrl(options, item) {
    const protocol = options.https ? 'https://' : 'http://';
    return u.checkUrl(protocol, options.host, item.path);
  }

  function _checkHost(url) {
    url = url.replace(/http(s?):\/\//gm, '');
    return url;
  }

  /**
   * Preleva i valori degli headers e del referer
   * @param options
   * @param item
   * @param sequence
   * @param index
   */
  function _keep(options, item, sequence, index) {
    item.headers.forEach((h) => options.headers[h.name.toLowerCase()] = h.value);
    u.keep(options, item, ['method', 'path'], true);
    if (item.host) options.host = _checkHost(item.host);

    //item precedente
    const preitem = (index > 0) ? sequence.items[index - 1] : null;

    if (item.referer) {
      const ref = item.referer.toLowerCase();
      // se 'auto' recupera l'indirizzo dello step precedente
      if (ref === 'auto') {
        if (preitem)
          options.headers.referer = _getUrl(options, preitem);
        // se inizia per '=' si aspetta un indice dello step di referer
      } else if (ref.indexOf('=') === 0) {
        const i = parseInt(ref.substr(1));
        if (i > -1 && i < sequence.items.length)
          options.headers.referer = _getUrl(options, sequence.items[i]);
        // altrimenti è esplicito
      } else options.headers.referer = item.referer;
    }
  }

  /**
   * verifica gli headers
   * @param o
   * @param item
   * @param data
   */
  function _validateHeaders(o, item, data) {
    if (data && data.length) {
      o.headers['content-length'] = data.length;
    } else {
      delete o.headers['content-length'];
    }

    if (!_.has(o.headers, 'host'))
      o.headers['host'] = o.host;
  }

  function _getItem(sequence, options, index, cb) {
    if (((sequence || {}).items || []).length > index) {
      while (sequence.items.length > index && sequence.items[index].skip) {
        if (options.verbose) console.log('[' + sequence.items[index].title + ']- n°' + index + 1 + ' SKIPPED');
        index++;
      }
      if (sequence.items.length <= index)
        return cb(new Error('Wrong sequence!'));
      cb(null, sequence.items[index], index);
    } else {
      cb(new Error('No available items!'));
    }
  }

  function _isLast(sequence, index) {
    while (index < sequence.items.length && sequence.items[index].skip) {
      index = index + 1;
    }
    return index + 1 >= sequence.items.length;
  }

  function _replaceSingleData(obj, prp, rgx, value) {
    if (_.isArray(obj)) {
      const pn = prp || 'value';
      obj.forEach((item) => {
        if (item[pn] && _.isFunction(item[pn].replace))
          item[pn] = item[pn].replace(rgx, value);
      });
    } else if (_.isObject(obj)) {
      const driver = (prp) ? prp : _.keys(obj);
      driver.forEach((k) => {
        if (_.isFunction(obj[k].replace))
          obj[k] = obj[k].replace(rgx, value);
      });
    }
  }

  /**
   * Scrive i valori dei parametri nei replacers [bookmark]
   * @param sequence
   * @param options
   * @param data
   */
  function _replaceData(sequence, options, data) {
    const seq_prop = ['host', 'path'];
    sequence.parameters.forEach((p) => {
      const rgx = new RegExp('\\[' + p.name + '\\]', 'gmi');
      //properties
      _replaceSingleData(options, seq_prop, rgx, p.value);
      //data
      _replaceSingleData(data, null, rgx, p.value);
      //headers
      _replaceSingleData(options.headers, null, rgx, p.value);
    });
  }

  function isValid(r) {
    return r != null && r !== undefined;
  }


  function _evalKeeperLogic(keeper, arg, util) {
    return (keeper||{}).logic ? (_eval[keeper.logicType]||_eval.bypass)(keeper.logic, arg, util) : arg;
  }

  function _getCookie(cookie, name) {
    if (cookie) {
      const cookies = cookie.split(';');
      let pos = 0;
      cookie = _.find(cookies, (c) => {
        pos = c.indexOf(name + '=');
        return pos > -1;
      });
      if (cookie)
        return cookie.substr(pos + 1);
    }
  }

  function _evalHeadersLogic(sequence, o) {
    _.keys(o.headers).forEach((k) => {
      const value = o.headers[k] || '';
      if (_.isFunction(value.indexOf) && value.indexOf(CONSTANTS.prefixes.js) === 0) {
        const logic = value.substr(CONSTANTS.prefixes.js.length);
        o.headers[k] = _eval.javascript(logic, null, sequence.jsutil);
      }
    });
  }

  /**
   * Esegue il singolo estrattore
   * @param sequence
   * @param keeper
   * @param options
   * @param content
   */
  function _evalKeeper(sequence, keeper, options, content) {
    const target = _.find(sequence.parameters, (p) => p.id === keeper.target);
    if (!target) return;
    let value = null;
    switch (keeper.sourceType) {
      case 'body':
        value = _evalKeeperLogic(keeper, content, sequence.jsutil);
        break;
      case 'cookies':
        let cookie = options.headers['cookie'] || options.headers['Cookie'];
        if (cookie) {
          if (keeper.name) cookie = _getCookie(cookie, name);
          value = _evalKeeperLogic(keeper, cookie, sequence.jsutil);
        }
        break;
      case 'headers':
        if (keeper.name) {
          let header = options.headers[name];
          if (header) value = _evalKeeperLogic(keeper, options.headers[k], sequence.jsutil);
        } else {
          value = _.find(_.keys(options.headers), (k) => isValid(_evalKeeperLogic(keeper, options.headers[k], sequence.jsutil)));
        }
        break;
    }
    if (value)
      target.value = value;
  }

  /**
   * Esegue gli estrattori a livello di item
   * @param sequence
   * @param item
   * @param options
   * @param content
   */
  function _evalKeepers(sequence, item, options, content) {
    if (item.keepers.length) {
      item.keepers.forEach((k) => _evalKeeper(sequence, k, options, content));
    }
  }

  /**
   * Effettua una catena di chiamate sequenziali
   * @param sequence
   * @param {function} cb  //cb(err, content)
   * @param {object} [po]
   * @param {object} [wo]
   * @param {number} [i]
   */
  function _evalSequence(sequence, cb, po, wo, i) {
    wo = _.merge(wo, opt_prototype);
    i = i || 0;

    if (wo.verbose) console.log('OPTIONS: ' + JSON.stringify(wo));
    _getItem(sequence, wo, i, function (err, item, index) {
      if (err) return cb(err);

      wo.https = sequence.SSL;
      wo.proxy = sequence.proxy;
      if (wo.verbose) console.log('[' + item.title + ']-OPTIONS: (before keep)' + JSON.stringify(wo));
      _keep(wo, item, sequence, index);
      if (wo.verbose) console.log('[' + item.title + ']-OPTIONS: (after keep)' + JSON.stringify(wo));

      if (wo.verbose) console.log('[' + item.title + ']-PRE DATA OBJECT: ' + JSON.stringify(item.data));
      _replaceData(sequence, wo, item.data);

      const data = _getItemData(sequence, item, wo);
      _validateHeaders(wo, item, data);
      _evalHeadersLogic(sequence, wo);

      if (wo.verbose) console.log('[' + item.title + ']-REQUEST BODY: ' + data);
      _doRequest(item.title, wo, data, undefined, (err, o, r, c) => {
        if (err) return cb(err);

        if (wo.verbose) console.log('[' + item.title + '] - RICHIESTA EFFETTUATA SENZA ERRORI step=' + index);

        if (_isLast(sequence, index)) {
          if (wo.verbose) console.log('[' + item.title + '] - LAST ITEM (' + index + ') START PARSER...');
          parser.parse(c, po, (err, data) => {
            if (err) return cb(err);
            if (wo.verbose) console.log('[' + item.title + '] - PARSER RESULT (' + index + ') START PARSER...');
            const result = proto.resultData();
            result.type = po.type;
            result.data = data;
            result.content = c;
            return cb(err, result);
          });
        } else {
          if (wo.verbose) console.log('[' + item.title + '] - NEXT ITEM (' + index + ' -> ' + (index + 1) + '?)');
          _evalKeepers(sequence, item, wo, c);
          _evalSequence(sequence, cb, po, wo, index + 1);
        }
      });
    });
  }


  /**
   * Effettua una catena di chiamate sequenziali
   * @param info                      // sequenza chiamate
   * @param {Function} cb             // cb(err, content)
   * @param {Object} [po]             // opzioni per il parser
   * @param {Object} [wo]             // opzioni chiamata web
   */
  function evalSequence(info, cb, po, wo) {
    const pOptions = proto.parserOptions(po);
    const wOptions = proto.webOptions(wo);
    const sequence = proto.sequence(info);
    return _evalSequence(sequence, cb, pOptions, wOptions, 0);
  }

  return {
    constants: CONSTANTS,
    util: {
      ok: function (res, obj) {return res.json(200, obj);},
      created: function (res, obj) {return res.json(201, obj);},
      deleted: function (res) {return res.json(204);},
      notfound: function (res) {return res.send(404);},
      error: function (res, err) {return res.send(500, err);},
      getkeeper: function (name) {return _.find(_keepers, {'name': name});},
      parseUrl: URL.parse
    },
    parser: {
      types: parser.types,
      parse: parser.parse,
      parseHtmlTable: parser.parseHtmlTable,
      parseJsonContent: parser.parseJsonContent,
      parseXmlContent: parser.parseXmlContent,
      parseCustomContent: parser.parseCustomContent
    },
    /**
     * esegue la sequenza:
     *
     * jsonizer.eval(sequence, callback, parserOptions, webOptions)
     *
     * callback: (err, result) => {
     *   result.type = {string}     >>> type of content (json,xml,html,...)
     *   result.data = {object}     >>> result object
     *   result.content = {string}; >>> the original remote content
     * }
     */
    eval: evalSequence
  };
}.call(this);

exports = module.exports = jsonizer;
