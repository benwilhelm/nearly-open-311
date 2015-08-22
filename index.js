var _ = require("lodash");
var async = require('async');
var request = require('request');
var yaml = require("js-yaml");
var fs = require("fs");
var requestTypes = yaml.safeLoad(fs.readFileSync(__dirname + '/data/request-types.yml'));
var cheerio = require('cheerio');

module.exports = function(){
  var cookieJar, req;
  var initialized = false;
  var fieldDefinitions = {};
  var contactData = {};
  var contactDataIsValid = false;
  var urls = {};
  var requestType;
  var requestFormData = {};
  var formDataIsValid = false;

  /**
   * The main request object returned by the module
   */
  var requestObject = {

    /**
     * Initialize the request with an address and request type.
     * @param opts - object containing the following keys:
     *   - requestType
     *   - streetNumber
     *   - streetDirection
     *   - streetName
     *   - streetSuffix
     *   - streetSuffixDir
     * @param callback - callback function with signature function(err, request)
     */
    initialize: function(opts, callback) {

      cookieJar = request.jar();
      req = request.defaults({jar: cookieJar, timeout: 30000});

      urls = generateUrls(opts);
      fieldDefinitions = getFieldDefinitions(opts.requestType);
      requestType = opts.requestType;

      async.waterfall([

        // getting session
        function(next){
          req.get({
            url: urls.reset
          }, next)
        },

        // setting location of complaint
        function(res, text, next) {
          var postData = getFormDataFromMarkup(text);
          postData.invStreetNumber = opts.streetNumber,
          postData.invStreetPrefix = opts.streetDirection,
          postData.invStreetName   = opts.streetName,
          postData.invStreetSuffix = opts.streetSuffix,

          req.post({
            url: urls.setLocation,
            form: postData
          }, next)
        },

        // setting service request type
        function(res, text, next) {
          req.get({
            url: urls.selectService
          }, next)
        },

        // seeding requestFormData with .NET hidden fields
        function(res, text, next) {
          var formData = getFormDataFromMarkup(text);
          requestFormData = _.merge(formData, requestFormData);
          initialized = true;
          next(null, text);
        }
      ], callback)
    },

    /**
     * Set the form data for the request.
     * Returns true if data is valid, or error hash if not
     */
    setFormData: function(data) {
      formDataIsValid = false;
      var validated = validateFormData(data, requestType);
      if (validated === true) {
        requestFormData = _.merge(requestFormData, data);
        formDataIsValid = true;
      }
      return validated;
    },

    getFormData: function() {
      if (!initialized) throw new Error("Please call initialize before calling getFormData")
      return requestFormData;
    },

    getForm: function() {
      if (!initialized) throw new Error("Please call initialize before calling getForm")
      return fieldDefinitions;
    },

    getRequestTypes: function() {
      if (!initialized) throw new Error("Please call initialize before calling getRequestTypes")
      return requestTypes;
    },

    getUserInput: function(idx) {
      if (!initialized) throw new Error("Please call initialize before calling getUserInput")

      if (idx && fieldDefinitions[idx])
        return requestFormData[idx];

      var keys = _.keys(fieldDefinitions);
      return _.pick(requestFormData, keys);
    },


    /**
     * Set contact info for the request.
     * emailAddress is the only required property
     * @param data - an object with the following keys:
     *
     *   - emailAddress * Required
     *   - firstName
     *   - lastName
     *   - streetNumber
     *   - streetDirection
     *   - streetName
     *   - streetSuffix
     *   - streetSuffixDir
     *   - phone1
     *   - phone1Type
     *   - phone1Ext
     *   - phone2
     *   - phone2Type
     *   - phone2Ext
     *   - phone3
     *   - phone3Type
     *   - phone3Ext
     *   - textUpdates
     */
    setContactData: function(data) {
        contactDataIsValid = false;
        var validated = validateContactData(data);
        if (validated === true) {
          contactData = data;
          contactDataIsValid = true;
        }
        return validated;
    },


    verify: function(callback) {
      if (!formDataIsValid)    return callback({reason: "Form Data is invalid"});
      if (!contactDataIsValid) return callback({reason: "Contact Data is invalid"});

      var filteredContactData = convertContactData(contactData, requestType);
      var compositeRequestData = _.merge(requestFormData, filteredContactData);

      var requiredKeys = _.keys(require("./test-review.json"))
      var requestKeys = _.keys(compositeRequestData);
      var missingKeys = [];
      _.each(requiredKeys, function(key){
        if (!_.contains(requestKeys, key)) {
          missingKeys.push(key);
        }
      })

      req.post({ url: urls.reviewRequest, form: compositeRequestData }, function(err, req, txt){
        if (err)  return callback(err);
        if (!txt) return callback({reason: "An unknown error occurred."})
        callback(err, txt);
      })
    },


    /**
     * Submits the request
     */
    submit: function(callback) {
      req.post({url: urls.submitRequest, form: {}}, callback);
    }
  }

  return requestObject;



  // ========================
  // PRIVATE FUNCTIONS
  // ========================

  function validateFormData(data) {
    var invalid = false;
    var errorObj = { invalid: true, errors: {} };

    if (!requestType) {
      invalid = true;
      errorObj.errors.requestType = "You have not defined a request type. Make sure you're initializing the request before submitting form data.";
    }

    var dataKeys = _.keys(data);
    _.each(fieldDefinitions, function(field, key) {

      // check for required field
      if (field.required && !_.contains(dataKeys, key)) {
        invalid = true;
        errorObj.errors[key] = key + " is a required field.";
      }

      // check for option-based questions
      if (field.options && data[key] && !_.contains(field.options, data[key])) {
        invalid = true;
        errorObj.errors[key] = key + " must be one of: " + field.options.join(' | ');
      }
    });

    return (invalid) ? errorObj : true;
  }

  function validateContactData(data) {
      var invalid = false;
      var errorObj = { invalid: true, errors: {} };

      if (!isEmail(data.emailAddress)) {
          invalid = true;
          errorObj.errors.emailAddress = "That email address does not appear to be valid"
      }

      if (!data.emailAddress) {
          invalid = true;
          errorObj.errors.emailAddress = "Email Address (emailAddress) is required"
      }

      _.each(["phone1", "phone2", "phone3"], function(key){
          var normalized = normalizePhone(data[key])
          if (data[key] && !normalized) {
              invalid = true;
              errorObj.errors[key] = key + " does not appear to be a valid phone number"
          }
      })

      return (invalid) ? errorObj : true;
  }
}




// ========================
// MODULE FUNCTIONS
// ========================


var defaultUrls = {
  reset: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=locform",
  setLocation: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=locvalidate",
  selectService: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=csrform",
  reviewRequest: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=review",
  submitRequest: "https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=csrupdate"
}

function generateUrls(opts) {
  var urls = _.clone(defaultUrls);
  var typeString = "&invSRType=";
  typeString += opts.requestType;
  typeString += "&invSRDesc=" + encodeURIComponent(requestTypes[opts.requestType]);

  urls.setLocation += typeString;
  urls.reset += typeString;
  urls.reset += "&locreq=Y&stnumreqd=Y";
  return urls;
}

function getFieldDefinitions(type) {
  type = type.toUpperCase();
  if (!_.contains(_.keys(requestTypes), type)) {
    throw new Error("Non-existent request type: " + type);
  }

  var path = __dirname + "/data/request-type-definitions/" + type + ".yml";
  try {
    var yml = fs.readFileSync(path);
    return yaml.safeLoad(yml);
  } catch (e) {
    throw new Error("Request type '" + type + "' has not been implemented yet.  See the module README for instructions for implementing it yourself");
  }
}

/**
 * a very permissive validator.  Mostly just a sanity check
 */
function isEmail(address) {
    return address && !!address.match(/^(.+)@(.+)\.(.+)$/)
}

function convertContactData(data, requestType) {
    var fieldMap = {
        "emailAddress"    : "invParticipantEmailAddress_CALLER",
        "firstName"       : "invParticipantFirstName_CALLER",
        "lastName"        : "invParticipantLastName_CALLER",
        "streetNumber"    : "invParticipantStreetNumber_CALLER",
        "streetDirection" : "invParticipantStreetPrefix_CALLER",
        "streetName"      : "invParticipantStreetName_CALLER",
        "streetSuffix"    : "invParticipantStreetSuffix_CALLER",
        "city"            : "invParticipantCity_CALLER",
        "state"           : "invParticipantStateCode_CALLER",
        "zip"             : "invParticipantZipCode_CALLER",
        "phone1"          : "invParticipantContactPhoneType_CALLER_1",
        "phone1Type"      : "invParticipantContactPhoneNumber_CALLER_1",
        "phone1Ext"       : "invParticipantContactPhoneDetails_CALLER_1",
        "phone2"          : "invParticipantContactPhoneType_CALLER_2",
        "phone2Type"      : "invParticipantContactPhoneNumber_CALLER_2",
        "phone2Ext"       : "invParticipantContactPhoneDetails_CALLER_2",
        "phone3"          : "invParticipantContactPhoneType_CALLER_3",
        "phone3Type"      : "invParticipantContactPhoneNumber_CALLER_3",
        "phone3Ext"       : "invParticipantContactPhoneDetails_CALLER_3"
    }

    var convertedData = {};
    _.each(data, function(val, key){
        var chiKey = fieldMap[key];
        convertedData[chiKey] = val;
    })

    if (data.phone1 && data.textUpdates) {
        convertedData["fn_" + requestType + "_A511OPTN"] = data.phone1;
    }

    return convertedData;
}

function normalizePhone(input) {
    input = input+'';
    input = input.replace(/\D/g, "");   // remove non-numeric characters
    input = input.replace(/^1/, "");    // remove leading 1 if present

    // check that remainder is 10 digits, split into components for easy formatting
    var match = input.match(/^\d{10}$/);

    if (!match) {
        return false;
    }

    return match[0]
}

function getFormDataFromMarkup(text) {
  var returnObj = {};
  var $ = cheerio.load(text);
  var $inputs = $("select, input, textarea");
  $inputs.each(function(idx, el){
    var key = $(el).attr('name');
    if (key) {
      returnObj[key] = $(el).val();
    }
  })

  return returnObj;
}
