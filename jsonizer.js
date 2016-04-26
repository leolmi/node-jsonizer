/*
 * jsonizer
 * Copyright 2015
 * Authors: Leo Olmi.
 * All Rights Reserved.
 * Use, reproduction, distribution, and modification of this code is subject to the terms and
 * conditions of the MIT license, available at http://www.opensource.org/licenses/mit-license.php
 *
 * Project: https://github.com/leolmi/jsonizer
 */

var _ = require('lodash'),
  u = require('./lib/utils'),
  parser = require('./lib/parser'),
  https = require('https'),
  http = require('http'),
  querystring = require('querystring'),
  //cheerio = require("cheerio"),
  zlib = require("zlib");


'use strict';
var jsonizer = function() {
  function noop(){}

  var opt_prototype = {
  };

  var _keepers = [
    { name:'__VIEWSTATE', pattern:'<input.*?name="__VIEWSTATE".*?value="(.*?)".*?>'},
    { name:'__VIEWSTATEGENERATOR', pattern:'<input.*?name="__VIEWSTATEGENERATOR".*?value="(.*?)".*?>' },
    { name:'__EVENTVALIDATION', pattern:'<input.*?name="__EVENTVALIDATION".*?value="(.*?)".*?>' }
  ];



  /**
   *
   * @param {[]} o
   * @param {boolean,function} [encode]
   * @returns {*}
   */
  function getObjectData(o, encode) {
    var eo = {};
    if (typeof encode==='function') {
      for (var p in o)
        eo[p] = encode(o[p]);
      return querystring.stringify(eo);
    } else if (encode) {
      for (var p in o)
        eo[p] = u.encodeToEsa(o[p]);
      return querystring.stringify(eo);
    }
    else {
      return querystring.stringify(o);
    }
  }

  function getArrayData(a, encode) {
    if (!a || !a.length) return undefined;
    var eo = {};
    if (typeof encode==='function') {
      a.forEach(function(i){ eo[i.name] = encode(i.value); });
    } else if (encode) {
      a.forEach(function(i){ eo[i.name] = u.encodeToEsa(i.value); });
    } else {
      a.forEach(function(i){ eo[i.name] = i.value; });
    }
    return querystring.stringify(eo);
  }

  function getData(data, encode) {
    if (data) {
      if (_.isString(data))
        return data;
      if (_.isArray(data)) {
        if (data.length <= 0)
          return undefined;
        return getArrayData(data, encode);
      }
      if (_.isObject(data))
        return getObjectData(data, encode);
    }
    return undefined;
  }


  function getRedirectPath(opt, nxt) {
    if (nxt.indexOf(opt.host)<0)
      return opt.host + nxt;
    return nxt;
  }

  function checkCookies(res, o) {
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
  function doRequest(title, options, data, target, cb) {
    var skipped = false;
    var download = false;
    cb = cb || noop;
    if (options.verbose) console.log('['+title+']-OPTIONS: ' + JSON.stringify(options, null, 2));
    options.agent = false;
    var proto = options.https ? https : http;
    var protocol = options.https ? 'https://' : 'http://';

    var req_opt = {
      path: protocol + options.host + options.path,
      method: options.method,
      headers: options.headers
    };

    console.log('['+title+']-ENV: ' + JSON.stringify(process.env));

    if (process.env.PROXY_URL && process.env.PROXY_PORT) {
      req_opt.host = process.env.PROXY_URL;
      req_opt.port = process.env.PROXY_PORT;
    }

    if (options.verbose) console.log('['+title+']-REQ OPT: ' + JSON.stringify(req_opt, null, 2));

    var req = proto.request(req_opt, function(res) {
      var result = {
        code:res.statusCode,
        headers:res.headers
      };
      if (options.verbose) console.log('['+title+']-RESULTS: ' + JSON.stringify(result, null, 2));


      var newpath = res.headers.location;
      if ((res.statusCode.toString()=='302' || res.statusCode.toString()=='301') && newpath) {
        skipped = true;
        if (options.verbose) console.log('new location:'+newpath);
        var path = getRedirectPath(options ,newpath);
        if (path==options.path){
          console.log('Location is the same!');
          return;
        }
        options.path = path;
        if (options.verbose) console.log('Redir new path:'+options.path);
        checkCookies(res, options);

        doRequest('redir - '+title, options, null, null, cb);
      }

      if (target) {
        download = true;
        res.setEncoding('binary');
        res.pipe(target);
        target.on('finish', function() {
          if (options.verbose) console.log('Write file ended!');
          target.close(cb(null, options,result));
        });
      }

      var chunks = [];
      var content = '';

      res.on('data', function (chunk) {
        var type = _.isString(chunk) ? 'stringa' : 'altro';
        if (options.verbose) console.log('[' + title + ']-download data (' + type + '): ' + chunk);
        content += chunk;
        chunks.push(chunk);
      });

      res.on('end', function () {
        if (options.verbose) console.log('['+title+']-Fine richiesta!   skipped='+skipped+'   download='+download+'  target='+(target ? 'si' : 'no'));
        if (!skipped && !target && !download) {
          options.headers = _.merge(options.headers, req.headers);
          var buffer = Buffer.concat(chunks);

          var encoding = res.headers['content-encoding'];
          if (encoding == 'gzip') {
            zlib.gunzip(buffer, function(err, decoded) {
              cb(err, options, result, decoded && decoded.toString());
            });
          } else if (encoding == 'deflate') {
            zlib.inflate(buffer, function(err, decoded) {
              cb(err, options, result, decoded && decoded.toString());
            })
          } else {
            cb(null, options, result, buffer.toString());
          }
        }
      });
    });

    req.on('error', function(e) {
      if (options.verbose) console.log('['+title+']-problem with request: ' + JSON.stringify(e));
      cb(e);
    });

    if (data) {
      if (options.verbose) console.log('['+title+']-send data: '+data);
      req.write(data);
    }

    req.end();
  }

  /**
   * Valida la classe delle opzioni
   * @param options
   */
  function check(options) {
    if (!_.has(options, 'headers'))
      options.headers = {};
  }

  function checkKeepers(keepers, content) {
    if (keepers && keepers.length && content){
      keepers.forEach(function(k){
        if (k.mode && k.mode=='onetime' && k.value) {
          //skip keeper
        } else if (k.content) {
          var rgx = new RegExp(k.content, 'g');
          var v = rgx.exec(content);
          if (v && v.length) k.value = v[1];
        }
      });
    }
  }



  //function parseHtmlTable(html, pattern, cb) {
  //  try {
  //    var table = [];
  //    var $ = cheerio.load(html);
  //    var res = eval(pattern);
  //    res.find('tr').each(function () {
  //      var row = {};
  //      $(this).children().each(function (i, e) {
  //        row['C' + i] = $(e).text();
  //      });
  //      table.push(row);
  //    });
  //    return cb(null, table);
  //  }
  //  catch(err) {
  //    return cb(err);
  //  }
  //}
  //
  //function parse(content, options, cb){
  //  cb = cb || noop;
  //  options = options || {};
  //  var type = options.type || 'none';
  //  switch (type){
  //    //PARSER HTML
  //    case 'htmltable': return parseHtmlTable(content, options.pattern, cb);
  //    //DEFAULT: restituisce il testo così come è stato recuperato
  //    default: return cb(null, content);
  //  }
  //}

  /**
   * valorizza il target secondo il tipo e se il valore esiste
   * @param {object} sequence
   * @param {object} item
   * @param {object} sequencejs
   */
  function setTarget(sequence, item, sequencejs) {
    if (sequencejs.value) {
      if (sequencejs.ttype=='parameter') {
        var p = _.find(sequence.parameters, function(p) { return p.name==sequencejs.target; });
        if (p) p.value = sequencejs.value;
      }
      else {
        if (!item.data)
          item.data = {};
        item.data[sequencejs.name] = sequencejs.value;
      }
    }
  }
  function evalKeepers(sequence, item){
    if (sequence.keepers && sequence.keepers.length){
      sequence.keepers.forEach(function(k){
        setTarget(sequence, item, k);
      });
    }
  }

  /**
   * Esegue le azioni sul content
   * @param actions
   * @param sequence
   * @param item
   * @param [content]
   */
  function evalSequenceJS(actions, sequence, item, content){
    if (actions && actions.length){
      content = content || item.data;
      actions.forEach(function(a){
        if (a.content) {
          var f = new Function('content', 'params', a.content);
          var value = f(content, sequence.parameters);
          setTarget(sequence, item, value);
        }
      });
    }
  }

  function getUrl(o, item) {
    return o.host + item.path;
  }

  function checkHost(url){
    url = url.replace('http://','');
    url = url.replace('https://','');
    return url;
  }

  function keep(o, item, sequence, index) {
    item.headers.forEach(function(h){
      o.headers[h.name.toLowerCase()] = h.value;
    });
    u.keep(o, item, ['method','path'], true);
    if (item.host) o.host = checkHost(item.host);

    //item precedente
    var preitem = (index>0) ? sequence.items[index-1] : null;

    if (item.referer) {
      if (item.referer.toLowerCase()=='auto'){
        o.headers.referer = (preitem) ? getUrl(o, preitem) : undefined;
      }
      else o.headers.referer = item.referer;
    }
  }


  /**
   * Effettua una catena di chiamate sequenziali
   * @param sequence
   * @param {function} cb  //cb(err, content)
   * @param {object} [parseroptions]
   * @param {object} [options]
   * @param {number} [i]
   */
  function evalSequence(sequence, cb, parseroptions, options, i) {
    options = options || { headers: {}, verbose:true };
    //il merging con il prototipo garantisce la correttezza della classe
    options = _.merge(options, opt_prototype);
    i = i || 0;

    console.log('OPTIONS: '+JSON.stringify(options));
    if (!sequence || !sequence.items || sequence.items.length <= i)
      return cb(new Error('Sequence is empty or undefined!'));
    if (sequence.items.length < i + 1)
      return cb(new Error('Wrong sequence!'));
    var item = sequence.items[i];

    if (options.verbose) console.log('['+item.title+']-OPTIONS: (before check): ' + JSON.stringify(options));
    check(options);
    if (options.verbose) console.log('['+item.title+']-OPTIONS: (after check & before keep)' + JSON.stringify(options));
    keep(options, item, sequence, i);
    if (options.verbose) console.log('['+item.title+']-OPTIONS: (after keep & before keepers)' + JSON.stringify(options));
    evalKeepers(sequence, item);
    if (options.verbose) console.log('['+item.title+']-OPTIONS: (after keepers)' + JSON.stringify(options));

    evalSequenceJS(item.prejs, sequence, item);

    var data = getData(item.data);
    options.headers['content-length'] = data ? data.length : 0;

    if (options.verbose) console.log('['+item.title+']-REQUEST BODY: '+data);
    doRequest(item.title, options, data, undefined, function (err, o, r, c) {
      if (err)
        return cb(err);

      if (options.verbose) console.log('['+(i+1)+' '+item.title+'] - RICHIESTA EFFETTUATA CON SUCCESSO, CONTENT: '+c);

      checkCookies(r, options);

      if (i >= sequence.items.length - 1)
        return parser.parse(c, parseroptions, cb);

      if (c) {
        checkKeepers(sequence.keepers, c);
        evalSequenceJS(item.postjs, sequence, item, c);
      }

      evalSequence(sequence, cb, parseroptions, options, i+1);
    });
  }


  /**
   * Effettua una catena di chiamate sequenziali
   * @param sequence                  // sequenza chiamate
   * @param {Function} cb             // cb(err, content)
   * @param {Object} [parseroptions]  // opzioni per il parser html
   * @param {Object} [options]        // opzioni chiamata web
   */
  function evalSequenceStart(sequence, cb, parseroptions, options) {
    return evalSequence(sequence, cb, parseroptions, options, 0);
  }

  return  {
    util: {
      ok: function(res, obj) {return res.json(200, obj);},
      created: function(res, obj) {return res.json(201, obj);},
      deleted: function(res) {return res.json(204);},
      notfound: function(res) {return res.send(404); },
      error: function(res, err) { return res.send(500, err); },
      getkeeper: function(name) { return _.find(_keepers, {'name':name}); }
    },
    parser: {
      parseHtmlTable: parser.parseHtmlTable
    },
    eval: evalSequenceStart
  };
}.call(this);

exports = module.exports = jsonizer;
