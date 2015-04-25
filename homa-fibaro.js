#!/usr/bin/env node
var homa = require('homa');
var request = require("request");
var _ = require('underscore');
var log = require('./logger.js');

var systemId = homa.paramsWithDefaultSystemId("homa-fibaro");
var url;
var auth;

var handlers = [];

(function connect() {
  homa.logger.stream = require('dev-null')();
  homa.logger.on('log', function(msg) {
    log[msg.level](msg.prefix + " " + msg.message);
  });
  homa.mqttHelper.connect();
})();

var fibaroCallAction = function(name, args, id, callback) {
  log.debug("callAction %s(%j) on %s", name, args, id);
  request({
    'uri' : url + "callAction",
    'auth' : auth,
    'qs' : _.extend({ 'deviceId' : id, 'name' : name }, args)
  }, callback);
}

var ZDevice = function (id) {
  this.id = id;
}
ZDevice.prototype.initialise = function (properties) {
  if (properties.dead == "1") {
    log.warn("device " + this.id + " is dead");
    fibaroCallAction("wakeUpDeadDevice", {}, this.id, function (error, response, body) {});
  }
  if ("batteryLevel" in properties) {
    homa.mqttHelper.publish("/devices/zwave-"+ this.id + "/controls/battery-level/meta/type", "text" , true);
    homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/battery-level", properties.batteryLevel , true);
  }
}
ZDevice.prototype.applyUpdate = function (change) {
  if (change.dead == "1") {
    log.warn("device " + this.id + " is dead");
  }
  if ("batteryLevel" in change) {
    homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/battery-level", change.batteryLevel , true);
  }
}
ZDevice.prototype.handle = function (control, payload) {
    log.info("device " + this.id + ", control " + control + " received payload " + payload);
}

var BinaryLight = function(id) {
  ZDevice.call(this, id);
  log.info("New binary light " + this.id);
};
BinaryLight.prototype = Object.create(ZDevice.prototype);
BinaryLight.prototype.constructor = BinaryLight
BinaryLight.prototype.initialise = function (properties) {
  ZDevice.prototype.initialise.apply(this, arguments);
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
BinaryLight.prototype.handle = function(control, payload) {
  ZDevice.prototype.handle.apply(this, arguments);
  if (control == "switch") {
    if (payload == "0") {
      fibaroCallAction("turnOff", {}, this.id, function (error, response, body) {});
    } else {
      fibaroCallAction("turnOn", {}, this.id, function (error, response, body) {});
    }
  }
}

var DimmableLight = function(id) {
  ZDevice.call(this, id);
  log.info("New dimmable light " + id);
};
DimmableLight.prototype = Object.create(ZDevice.prototype);
DimmableLight.prototype.constructor = DimmableLight
DimmableLight.prototype.initialise = function (properties) {
  ZDevice.prototype.initialise.apply(this, arguments);
  if ("valueSensor" in properties) {
    homa.mqttHelper.publish("/devices/zwave-"+ this.id + "/controls/power/meta/type", "text" , true);
    homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/power", properties.valueSensor, true);
  }
  homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/switch/meta/type", "range" , true);
  homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/switch/meta/max", "99", true);
  homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/switch", properties.value, true);
}
DimmableLight.prototype.applyUpdate = function(change) {
  ZDevice.prototype.applyUpdate.apply(this, arguments);
  if ("valueSensor" in change) {
    homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/power", change.valueSensor, true);
  }
  if ("value" in change) {
    homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/switch", change.value, true);
  }
}
DimmableLight.prototype.handle = function(control, payload) {
  ZDevice.prototype.handle.apply(this, arguments);
  if (control == "switch") {
    var newValue = parseInt(payload, 10);
    if (!isNaN(newValue)) {
      fibaroCallAction("setValue", {'arg1':newValue}, this.id, function (error, response, body) {});
    }
  }
}

var TemperatureSensor = function (id) {
  ZDevice.call(this, id);
  log.info("New temperature sensor " + id);
}
TemperatureSensor.prototype = Object.create(ZDevice.prototype);
TemperatureSensor.prototype.constructor = TemperatureSensor
TemperatureSensor.prototype.initialise = function (properties) {
  ZDevice.prototype.initialise.apply(this, arguments);
  homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/temperature/meta/type", "text", true);
  homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/temperature", properties.value, true);
}
TemperatureSensor.prototype.applyUpdate = function (change) {
  ZDevice.prototype.applyUpdate.apply(this, arguments);
  if ("value" in change) {
    homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/temperature", change.value, true);
  }
};
TemperatureSensor.prototype.handle = function(control, payload) {
    ZDevice.prototype.handle.apply(this, arguments);
}

var DoorSensor = function (id) {
  ZDevice.call(this, id);
  log.info("New door sensor " + id);
};
DoorSensor.prototype = Object.create(ZDevice.prototype);
DoorSensor.prototype.constructor = DoorSensor
DoorSensor.prototype.initialise = function (properties) {
  var state = properties.value == "0" ? "closed" : "open";
  ZDevice.prototype.initialise.apply(this, arguments);
  homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/door/meta/type", "text", true);
  homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/door", state, true);
  this.previousState = state;
}
DoorSensor.prototype.applyUpdate = function (change) {
  ZDevice.prototype.applyUpdate.apply(this, arguments);
  if ("value" in change) {
    var state = change.value == "0" ? "closed" : "open";
    homa.mqttHelper.publish("/devices/zwave-" + this.id + "/controls/door", state, true);
    if (this.previousState != change.value) {
      homa.mqttHelper.publish("/events/zwave-" + this.id + "/door", state, false);
      this.previousState = state;
    }
  }
};
DoorSensor.prototype.handle = function(control, payload) {
    ZDevice.prototype.handle.apply(this, arguments);
}

var pollFibaro = function () {
  log.debug("refreshStates last=" + (pollFibaro.last || "0"));
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
  homa.settings.require('url');
  homa.settings.require('username');
  homa.settings.require('password');

  homa.mqttHelper.subscribe("/devices/+/controls/+/on");
});

homa.mqttHelper.on('message', function(packet) {
  homa.settings.insert(packet.topic, packet.payload);
  if (!homa.settings.isLocked() && homa.settings.isBootstrapCompleted()) {
    homa.settings.lock();
    url = homa.settings.get('url');
    auth = {
      'username' : homa.settings.get('username').toString(),
      'password' : homa.settings.get('password').toString()
    };

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
  }

  var match = /^\/devices\/zwave-(\d+)\/controls\/([^\/]+)\/on/.exec(packet.topic)
  if (match != null) {
    var id = match[1];
    var control = match[2];
    var payload = packet.payload;
    if (id in handlers) {
      handlers[id].handle(control, payload);
    }
  }
});

