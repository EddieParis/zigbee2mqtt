import Extension from "./extension";
import * as settings from "../util/settings";
import utils from "lib/util/utils";
import logger from "../util/logger";
import bind from "bind-decorator";
import { MqttPublishOptions } from "lib/mqtt";
import { forEach } from "jszip";
import * as zhc from "zigbee-herdsman-converters";

const VERSION = "3.0"

const HOMIE_PREFIX = "homie";
export class Homie extends Extension{
    private homieHelper: HomieHelper;
    private devices: Map<string, HomieDevice>;

    /* to remove */
    private flag: boolean;

    constructor(
        zigbee: Zigbee,
        mqtt: Mqtt,
        state: State,
        publishEntityState: PublishEntityState,
        eventBus: EventBus,
        enableDisableExtension: (enable: boolean, name: string) => Promise<void>,
        restartCallback: () => Promise<void>,
        addExtension: (extension: Extension) => Promise<void>,
    ) {
        super(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension);
        this.homieHelper = new HomieHelper(mqtt, HOMIE_PREFIX);
        this.devices = new Map<string, HomieDevice>();
        this.flag = false;
    }

    override async start(): Promise<void> {
/*
        if (!settings.get().advanced.cache_state) {
            logger.warning("In order for Home Assistant integration to work properly set `cache_state: true");
        }
*/
        /*this.zigbee2MQTTVersion = (await utils.getZigbee2MQTTVersion(false)).version;
        this.discoveryOrigin = {name: "Zigbee2MQTT", sw: this.zigbee2MQTTVersion, url: "https://www.zigbee2mqtt.io"};
        this.bridge = this.getBridgeEntity(await this.zigbee.getCoordinatorVersion());
        this.bridgeIdentifier = this.getDevicePayload(this.bridge).identifiers[0];*/
        this.eventBus.onEntityRemoved(this, this.onEntityRemoved);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        /*this.eventBus.onEntityRenamed(this, this.onEntityRenamed);
        this.eventBus.onPublishEntityState(this, this.onPublishEntityState);
        this.eventBus.onGroupMembersChanged(this, this.onGroupMembersChanged);*/
        this.eventBus.onDeviceAnnounce(this, this.onZigbeeEvent);
        this.eventBus.onDeviceJoined(this, this.onZigbeeEvent);
        this.eventBus.onDeviceInterview(this, this.onZigbeeEvent);
        this.eventBus.onDeviceMessage(this, this.onZigbeeEvent);
        /*this.eventBus.onScenesChanged(this, this.onScenesChanged);
        this.eventBus.onEntityOptionsChanged(this, async (data) => await this.discover(data.entity));*/
        this.eventBus.onExposesChanged(this, async (data) => await this.discover(data.device));

        /*await this.mqtt.subscribe(this.statusTopic);*/

        /**
         * Prevent unnecessary re-discovery of entities by waiting 5 seconds for retained discovery messages to come in.
         * Any received discovery messages will not be published again.
         * Unsubscribe from the discoveryTopic to prevent receiving our own messages.
         */
        const discoverWait = 5;
        // Discover with `published = false`, this will populate `this.discovered` without publishing the discoveries.
        // This is needed for clearing outdated entries in `this.onMQTTMessage()`
       /* await this.discover(this.bridge, false);

        for (const e of this.zigbee.devicesAndGroupsIterator(utils.deviceNotCoordinator)) {
            await this.discover(e, false);
        }

        logger.debug(`Homie: Discovering entities to Home Assistant in ${discoverWait}s`);
        await this.mqtt.subscribe(`${this.discoveryTopic}/#`);
        setTimeout(async () => {
            await this.mqtt.unsubscribe(`${this.discoveryTopic}/#`);
            logger.debug("Discovering entities to Home Assistant");

            await this.discover(this.bridge);

            for (const e of this.zigbee.devicesAndGroupsIterator(utils.deviceNotCoordinator)) {
                await this.discover(e);
            }
        }, utils.seconds(discoverWait));*/
    }

    @bind
    async onZigbeeEvent(data: {device: Device}): Promise<void> {
        /*if (!this.getDiscovered(data.device).discovered) {
            await this.discover(data.device);
        }*/
        logger.debug(`Homie: Zigbee event received for '${data.device.name}'`);
        /*if (!this.flag) {
            this.flag = true;

            logger.debug(`Homie: exposing device '${data.device.name}'`); 

            const device_id = data.device.ieeeAddr;
            const device = new HomieDevice(this.homieHelper, device_id, device_id);
            const property = new HomieProperty(this.homieHelper, "clong", "Beautiful clong", "float", "mV", undefined, "1000", true, true);
            const node = new HomieNode(this.homieHelper, "nodeId", "Beautiful node", [property]);
            device.addNode(node);
            this.devices.set(device_id, device);

            await device.expose();

            logger.debug(`Homie: device '${data.device.name}' exposed.`);
        }*/

        await this.discover(data.device);
    }

    async discover(zDevice: Device): Promise<void> {

        if (this.devices.has(zDevice.ieeeAddr)) {
            logger.debug(`Homie: Device '${zDevice.name}' already exposed.`);
            return;
        }
        zDevice.exposes().forEach(async (expose) => {logger.debug(`Homie: ${zDevice.name} expose: ${expose.name}, type ${expose.type}, access ${expose.access}, desc ${expose.description}`); if (expose.features) {expose.features.forEach((feature) => {logger.debug(`Homie:    feature: ${feature.name}, type ${feature.type}, access ${feature.access}, desc ${feature.description}`);});}});
        
        const properties: HomieProperty[] = [];

        const device_id = zDevice.ieeeAddr;
        const device = new HomieDevice(this.homieHelper, device_id, device_id);

        for (const expose of zDevice.exposes()) {
            if (expose.type === "climate" || expose.type === "list") {
                const featuresProperties = [];
                for (const feature of expose.features || []) {
                    logger.debug(`Homie: Feature label ${feature.label}`);
                    // transpose type to mqtt datatype
                    featuresProperties.push(new HomieProperty(this.homieHelper, feature.name, feature.label, feature.type, undefined, undefined, "", true, (feature.access & zhc.access.SET) !== 0));
                }
                const node = new HomieNode(this.homieHelper, expose.type, expose.type, featuresProperties);
                await device.addNode(node);
                continue;
            }
            logger.debug(`Homie: label ${expose.label}`);

            // transpose type to mqtt datatype
            properties.push(new HomieProperty(this.homieHelper, expose.name, expose.label, expose.type, undefined, undefined, "", true, (expose.access & zhc.access.SET) !== 0));
        }
        const node = new HomieNode(this.homieHelper, "main", "Main", properties);
        device.addNode(node);
        this.devices.set(device_id, device);

        await device.expose();
    };

    @bind async onEntityRemoved(data: eventdata.EntityRemoved): Promise<void> {
        logger.debug(`Homie: Clearing Home Assistant discovery for '${data.name}'`);
    }

    @bind private async onMQTTMessage(data: eventdata.MQTTMessage): Promise<void> {
        const topicParts = data.topic.split('/');
        if (topicParts[0] === HOMIE_PREFIX) {
            const device = this.devices.get(topicParts[1]);
            if (device) {
                await device.trySet(topicParts[1], topicParts[2], topicParts[3], data.message);
            } else {
                logger.debug(`Homie: Got homie message for unregistered device (${topicParts[1]}).`)
            }
        }
    }

    /*
    async expose() Promise<void> {
        // Expose the homie devices
        for (const [ID, device] of this.devices) {
            await device.expose(this.mqtt, [this.id, "devices", ID]);
        }
    }

    async addDevice(ID: string, device: HomieDevice): Promise<void> {
        this.devices.set(ID, device);
    }

    async removeDevice(ID: string): Promise<void> {
        const device = this.devices.get(ID);
        if (device) {
            await device.remove();
        }
        this.devices.delete(ID);
    }*/

};

class HomieHelper {
    public mqtt: Mqtt;
    private publishOptions: Partial<MqttPublishOptions> = {};

    constructor(mqtt: Mqtt, homieTopic: string | undefined) {
        this.mqtt = mqtt;
        if (homieTopic) {
            this.publishOptions.baseTopic = homieTopic;
        }
    }

    async publish(topic: string[], data: string): Promise<string> {
        var assembled_topic = topic.join("/")
        await this.mqtt.publish(assembled_topic, data, this.publishOptions);
        return assembled_topic;
    }

    async publishFullTopic(topic: string, data: string): Promise<void> {
        await this.mqtt.publish(topic, data, this.publishOptions);
    }

    async remove_topic(topic: string): Promise<void> {
        await this.mqtt.publish(topic, "");
    }

    async subscribe(topic: string[]): Promise<string> {
        // no option at play here, we have to add base topic
        var assembled_topic = this.publishOptions.baseTopic + '/' + topic.join("/");
        this.mqtt.subscribe(assembled_topic);
        return assembled_topic;
    }

};

export class HomieDevice {

    protected homie: HomieHelper;
    protected nodes: Map<string, HomieNode>;
    protected id: string;
    protected name: string;
    protected state_topic: string;

    constructor(homie: HomieHelper, id: string, name: string) {
        this.homie = homie;
        this.id = id;
        this.name = name;
        this.nodes = new Map<string, HomieNode>();
        this.state_topic = "";
    }

    async addNode(node: HomieNode): Promise<void> {
        this.nodes.set(node.id, node);
    }

    async expose(): Promise<void> {
        const base_list: string[] = [this.id, "$state"]

        base_list[base_list.length - 1] = "$homie"
        await this.homie.publish(base_list, VERSION)

        // base_list[base_list.length - 1] = "$name"
        // self.name_topic = self.publish(base_list, nice_device_name)

        base_list[base_list.length - 1] = "$state"
        this.state_topic = await this.homie.publish(base_list, "init")

        for (const node of this.nodes.values()) {
            await node.expose(base_list);
        }

        await this.homie.publishFullTopic(this.state_topic, "ready");
    };

    async trySet(deviceId: string, nodeId: string, propertyId: string, value: string): Promise<boolean> {
        const node = this.nodes.get(nodeId);
        if (node) {
            return await node.trySet(deviceId, nodeId, propertyId, value);
        } else {
            logger.debug(`Homie: Got homie message for unregistered device node (${deviceId}/${nodeId}).`);
            return false;
        }
    }
};

export class HomieNode {

    protected homie: HomieHelper;
    // map property name to property object
    protected properties: Map<string, HomieProperty>;
    public id: string;
    public readonly name: string;

    constructor(homie: HomieHelper, id: string, name: string, properties: HomieProperty[]) {
        this.homie = homie;
        this.id = id;
        this.name = name;
        this.properties = new Map<string, HomieProperty>;
        properties.forEach((prop) => this.properties.set(prop.ID, prop));
    }

    async expose(base_list: string[]): Promise<void> {
        base_list[base_list.length - 1] = this.id

        base_list.push("$name")
        this.homie.publish(base_list, this.name)

        // list the available properties in a comma separated list
        base_list[base_list.length - 1] = "$properties"
        this.homie.publish(base_list, Array.from(this.properties.keys()).join(","));

        // expose the properties of the node
        for (const property of this.properties.values()) {
            await property.expose(base_list);
        }
        base_list.pop();
    };

    async trySet(deviceId: string, nodeId: string, propertyId: string, value: string): Promise<boolean> {
        const property = this.properties.get(propertyId);
        if (property) {
            return await property.setValue(deviceId, nodeId, propertyId, value);
        } else {
            logger.debug(`Homie: Got homie message for unregistered device node property (${deviceId}/${nodeId}/${propertyId}).`);
            return false;
        }
    }

};


export class HomieProperty {
    protected homie: HomieHelper;
    public ID: string;
    protected readonly name: string;
    protected type: string;
    protected unit: string | undefined;
    protected format: string | undefined;
    protected value: any;
    protected settable: boolean;
    protected retained: boolean;

    // Quick access to value topic
    protected value_topic: string = "";
    // store build topics, avoids to rebuild when deleting device.
    protected topicsToRemove: string[] = [];

    constructor(homie: HomieHelper, propertyId: string, name: string, type: string, unit?: string, format?: string, init_value?: any, retained?: boolean, settable?: boolean) {
        this.homie = homie;
        this.ID = propertyId;
        this.name = name;
        this.type = type;
        this.unit = unit;
        this.format = format;
        this.retained = retained || false;
        this.settable = settable || false;

        this.value = init_value.toString();
    }

    async expose(base_list: string[]): Promise<void> {

        base_list[base_list.length - 1] = this.ID
        this.value_topic = await this.homie.publish(base_list, this.value)

        base_list.push("$name");
        this.topicsToRemove.push(await this.homie.publish(base_list, this.name));

        base_list[base_list.length - 1] = "$datatype";
        await this.homie.publish(base_list, this.type);

        if (this.unit) {
            base_list[base_list.length - 1] = "$unit";
            await this.homie.publish(base_list, this.unit);
        }
        if (this.format) {
            base_list[base_list.length - 1] = "$format";
            await this.homie.publish(base_list, this.format);
        }

        if (!this.retained) {
            base_list[base_list.length - 1] = "$retained";
            await this.homie.publish(base_list, "false");
        }

        if (this.settable) {
            base_list[base_list.length - 1] = "$settable";
            await this.homie.publish(base_list, "true");
            base_list[base_list.length - 1] = "set";
            await this.homie.subscribe(base_list);
        }

        base_list.pop();
    }

    async remove(): Promise<void> {
        this.homie.remove_topic(this.value_topic);
        for (var topic of this.topicsToRemove) {
            this.homie.remove_topic(topic);
        }

    }

    async setValue(deviceId: string, nodeId: string, propertyId: string, value: string): Promise<boolean> {
        logger.debug(`Homie: Value ${value} set for device node property (${deviceId}/${nodeId}/${propertyId}).`);
        return true;
    }
};

export default Homie;
