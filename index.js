var _ = require("lodash");
var async = require('async');
var request = require('request');
var yaml = require("js-yaml");
var fs = require("fs");
var requestTypes = yaml.safeLoad(fs.readFileSync(__dirname + '/data/_request-types.yml'));

module.exports = function(){
  var cookieJar = request.jar();
  var req = request.defaults({jar: cookieJar, timeout: 30000});
  var fieldDefinitions = {};
  var urls = {};
  var requestType;
  var requestFormData = {};

  /**
   * The main request object returned by the module
   */
  var requestObject = {

    /**
     * Initialize the request with an address and request type.
     * @param opts - object containing keys requestType, streetNumber, streetDirection, streetName, streetSuffix, streetSuffixDir
     * @param callback - callback function with signature function(err, request)
     */
    initialize: function(opts, callback) {
      opts = _.merge({
        requestType: "AAE",
        streetNumber: 4955,
        streetDirection: "N",
        streetName: "Damen",
        streetSuffix: "Ave"
      }, opts)

      urls = generateUrls(opts);
      fieldDefinitions = getFieldDefinitions(opts.requestType);
      requestType = opts.requestType;

      async.series([
        function(next){
          // console.log('initializing')
          req.get({
            url: urls.reset
          }, next)
        },
        function(next) {
          // console.log('setting address')
          var postData = {
            invStreetNumber: opts.streetNumber,
            invStreetDirection: opts.streetDirection,
            invStreetName: opts.streetName,
            invStreetSuffix: opts.streetSuffix
          }
          req.post({
            url: urls.setLocation,
            formData: postData
          }, next)
        },
        function(next) {
          // console.log('setting request type')
          req.get({
            url: urls.selectService
          }, next)
        }
      ], function(err, rslt){
        callback(err, rslt[2])
      })
    },

    /**
     * Set the form data for the request.
     * Returns true if data is valid, or error hash if not
     */
    setFormData: function(data) {
      var validated = validateFormData(data, requestType);
      if (validated === true) {
        requestFormData = data;
      }
      return validated;
    },

    getForm: function() {
      return fieldDefinitions;
    }
  }

  return requestObject;


  function validateFormData(data) {
    var invalid = false;
    var errorObj = { invalid: true, errors: {} };

    if (!requestType) {
      invalid = true;
      errorObj.errors.requestType = "RequestType is not yet defined. Make sure you're initializing the request before submitting form data.";
    }

    var dataKeys = _.keys(data);
    _.each(fieldDefinitions, function(field, key) {
      if (field.required && !_.contains(dataKeys, key)) {
        invalid = true;
        errorObj.errors[key] = key + " is a required field.";
      }
    });

    if (invalid) {
      return errorObj;
    }
    return true;
  }
}




// ========================
// PRIVATE FUNCTIONS
// ========================


var defaultUrls = {
  reset: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=reset",
  setLocation: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=locvalidate",
  selectService: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=csrform&invSRType="
}

function generateUrls(opts) {
  var urls = _.clone(defaultUrls);
  urls.selectService += opts.requestType;
  return urls;
}

function getFieldDefinitions(type) {
  type = type.toUpperCase();
  if (!_.contains(_.keys(requestTypes), type)) {
    throw new Error("Non-existent request type: " + type);
  }

  var path = __dirname + "/data/field-definitions/" + type + ".yml";
  try {
    var yml = fs.readFileSync(path);
    return yaml.safeLoad(yml);
  } catch (e) {
    throw new Error("Request type '" + type + "' has not been implemented yet.  See the module README for instructions for implementing it yourself");
  }
}
