#!/usr/bin/env node
var homa = require('homa');
var request = require("request");
var _ = require('underscore');

var systemId = homa.paramsWithDefaultSystemId("homa-fibaro");
var url = "http://HCL-000000.home/api/";
var auth = { 'username' : "homa", 'password' : "secret" };

var handlers = [];

(function connect() {
    homa.mqttHelper.connect();
})();

var fibaroCallAction = function(name, args, id, callback) {
  console.log("callAction %s(%j) on %s", name, args, id);
  request({
    'uri' : url + "callAction",
    'auth' : auth,
    'qs' : _.extend({ 'deviceId' : id, 'name' : name }, args)
  }, callback);
}

var ZDevice = function (id) {
  this.id = id;
}
ZDevice.prototype.handle = function (control, payload) {
    console.log("device " + this.id + ", control " + control + " received payload " + payload);
}
ZDevice.prototype.initialise = function (properties) {
  if (properties.dead == "1") {
    console.log("device " + this.id + " is dead");
  }
  if ("batteryLevel" in properties) {
    homa.mqttHelper.publish("/devices/zwave-"+ this.id + "/controls/battery-level/meta/type", "text" , true);
    homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/battery-level", properties.batteryLevel , true);
  }
}
ZDevice.prototype.applyUpdate = function (change) {
  console.dir(change);
  if (change.dead == "1") {
    console.log("device " + this.id + " is dead");
  }
  if ("batteryLevel" in change) {
    homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/battery-level", change.batteryLevel , true);
  }
}

var BinaryLight = function(id) {
  ZDevice.call(this, id);
  console.log("New binary light " + this.id);
};
BinaryLight.prototype = Object.create(ZDevice.prototype);
BinaryLight.prototype.constructor = BinaryLight
BinaryLight.prototype.initialise = function (properties) {
  ZDevice.prototype.initialise.apply(this, arguments);
  console.log("subscribe", "/devices/zwave-" + this.id + "/controls/switch/on");
  if ("valueSensor" in properties) {
    homa.mqttHelper.publish("/devices/zwave-"+ this.id + "/controls/power/meta/type", "text" , true);
    homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/power", properties.valueSensor, true);
  }
  homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/switch/meta/type", "switch" , true);
  homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/switch", properties.value, true);
}
BinaryLight.prototype.applyUpdate = function(change) {
  ZDevice.prototype.applyUpdate.apply(this, arguments);
  if ("valueSensor" in change) {
    homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/power", change.valueSensor, true);
  }
  if ("value" in change) {
    homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/switch", change.value, true);
  }
}

var DimmableLight = function(id) {
  ZDevice.call(this, id);
  console.log("New dimmable light " + id);
};
DimmableLight.prototype = Object.create(ZDevice.prototype);
DimmableLight.prototype.constructor = DimmableLight
DimmableLight.prototype.initialise = function (properties) {
  ZDevice.prototype.initialise.apply(this, arguments);
}
DimmableLight.prototype.applyUpdate = function(change) {
  ZDevice.prototype.applyUpdate.apply(this, arguments);
};

var TemperatureSensor = function (id) {
  ZDevice.call(this, id);
  console.log("New temperature sensor " + id);
}
TemperatureSensor.prototype = Object.create(ZDevice.prototype);
TemperatureSensor.prototype.constructor = TemperatureSensor
TemperatureSensor.prototype.initialise = function (properties) {
  ZDevice.prototype.initialise.apply(this, arguments);
}
TemperatureSensor.prototype.applyUpdate = function (change) {
  ZDevice.prototype.applyUpdate.apply(this, arguments);
};

var DoorSensor = function (id) {
  ZDevice.call(this, id);
  console.log("New door sensor " + id);
};
DoorSensor.prototype = Object.create(ZDevice.prototype);
DoorSensor.prototype.constructor = DoorSensor
DoorSensor.prototype.initialise = function (properties) {
  ZDevice.prototype.initialise.apply(this, arguments);
}
DoorSensor.prototype.applyUpdate = function (change) {
  ZDevice.prototype.applyUpdate.apply(this, arguments);
};

var pollFibaro = function () {
  console.log("refreshStates last=" + (pollFibaro.last || "0"));
  request({
    'uri' : url + "refreshStates",
    'auth' : auth,
    'qs' : { 'last' : pollFibaro.last || "0" }
  }, function (error, response, body) {
    var states = JSON.parse(body);
    pollFibaro.last = states.last;

    if ("changes" in states) {
      states.changes.forEach(function (change) {
        var id = change.id;
        if (id in handlers) {
          handlers[id].applyUpdate(change);
        }
      });
    }

    pollFibaro();
  });
}

homa.mqttHelper.on('connect', function(packet) {
  request({
    'uri' : url + "devices",
    'auth' : auth
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var fibaro = JSON.parse(body);
      fibaro.forEach(function(device) {
        var id = device.id;
        if (device.type == "binary_light") {
          handlers[id] = new BinaryLight(id);
        } else if (device.type == "dimmable_light") {
          handlers[id] = new DimmableLight(id);
        } else if (device.type == "temperature_sensor") {
          handlers[id] = new TemperatureSensor(id);
        } else if (device.type == "door_sensor") {
          handlers[id] = new DoorSensor(id);
        }
        if (id in handlers) {
          handlers[id].initialise(device.properties);
        }
      });
      pollFibaro();
    } else {
      process.exit(-1);
    }
  });
});

homa.mqttHelper.on('message', function(packet) {
  var match = /^\/devices\/zwave-(\d+)\//.exec(packet.topic)
  if (match != null) {
    var handler = handlers[match[1]];
    if (typeof handler !== 'undefined') {
      handler.handle(packet.payload);
    }
  }
});

