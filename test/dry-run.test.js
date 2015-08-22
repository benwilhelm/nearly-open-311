/**
 * ===============================================================
 * NOTE - This test makes live requests to the legacy 311 portal!
 * ===============================================================
 *
 * It stops short of submitting the request itself, but it parses the review
 * screen and checks for submitted values. RUN THIS TEST JUDICIOUSLY
 */

var cwd = process.cwd();
var async = require('async');
var req311 = require(cwd + "/index");
var _ = require('lodash');
var should = require('should');

describe("module request: dry run", function(){

  it("ok", function(done){

    var opts = {
      requestType: "AAE",
      streetNumber: 4955,
      streetDirection: "N",
      streetName: "Damen",
      streetSuffix: "Ave"
    }

    var r311 = req311();
    async.waterfall([
      function(next){
        r311.initialize(opts, next)
      },
      function(text, next){
        r311.setFormData({
          fn_AAE_ISTHEPOO: "Rainwater"
        })
        next(null);
      },
      function(next) {
        r311.setContactData({
          firstName: "Test",
          lastName: "Caller",
          emailAddress: "test@test.com"
        })
        next(null);
      },
      function(next) {
        r311.verify(next)
      }
    ], function(err, txt){
      if (err) throw err;
      txt.should.match(/Rainwater/, "'Rainwater' not found in response");
      txt.should.match(/4955/, "Address not found in response")
      txt.should.match(/test@test\.com/, "Email not found in response");
      done()
    })

  })
})
