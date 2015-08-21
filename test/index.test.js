var cwd = process.cwd();
var _ = require('lodash');
var should = require('should');
var sinon = require('sinon');
var request = require('request');
var _311 = require(cwd + "/index");

describe("module", function(){

  before(function(done){
    sinon.stub(request, 'get', function(opts, cb){ cb() });
    sinon.stub(request, 'post', function(opts, cb){ cb() });
    done();
  })

  beforeEach(function(done){
    request.get.reset();
    request.post.reset();
    done();
  })

  after(function(done){
    request.get.restore();
    request.post.restore();
    done();
  })

  describe("initialize() method", function(){

    it("should make appropriate requests to servicerequest.cityofchicago.org", function(done){

      var req311 = _311();
      var params = initializeParams();

      req311.initialize(params, function(err, res){
        request.get.callCount.should.eql(2);
        request.post.callCount.should.eql(1);

        var serviceUrl = request.get.args[1][0].url;
        serviceUrl.should.eql("https://servicerequest.cityofchicago.org/web_intake_chic/Controller?op=csrform&invSRType=AAE&invSRDesc=Water%20On%20Street")

        var formData = request.post.args[0][0].form;
        formData.invInterfaceType.should.eql("WEBINTAK");
        formData.invJurisdictionCode.should.eql("CHICAGO");
        formData.invStreetNumber.should.eql(1);
        formData.invStreetPrefix.should.eql("N");
        formData.invStreetName.should.eql("State");
        formData.invStreetSuffix.should.eql("Street");
        _.keys(formData).sort().should.eql([
          "invBuildingName",
          "invCity",
          "invCounty",
          "invFloor",
          "invInterfaceType",
          "invJurisdictionCode",
          "invLocRequired",
          "invSRTypeCode",
          "invStateCode",
          "invStreetName",
          "invStreetNumRequired",
          "invStreetNumber",
          "invStreetPrefix",
          "invStreetSuffix",
          "invStreetSuffixDir",
          "invUnitNumber",
          "invZipCode"
        ])
        done();
      })
    })
    
  })
})

function initializeParams(overrides) {
  return _.merge({
    requestType: "AAE",
    streetNumber: 1,
    streetDirection: "N",
    streetName: "State",
    streetSuffix: "Street"
  }, overrides)
}
