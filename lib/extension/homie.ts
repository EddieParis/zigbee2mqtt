import Extension from "./extension";
import * as settings from "../util/settings";
import utils from "lib/util/utils";
import logger from "../util/logger";
import bind from "bind-decorator";
import { MqttPublishOptions } from "lib/mqtt";
import { forEach } from "jszip";

export class Homie extends Extension{
    private devices: Map<string, HomieDevice> = new Map<string, HomieDevice>();
    private id: string = '';
    private type: string = '';
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
        /*this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onEntityRenamed(this, this.onEntityRenamed);
        this.eventBus.onPublishEntityState(this, this.onPublishEntityState);
        this.eventBus.onGroupMembersChanged(this, this.onGroupMembersChanged);*/
        this.eventBus.onDeviceAnnounce(this, this.onZigbeeEvent);
        this.eventBus.onDeviceJoined(this, this.onZigbeeEvent);
        this.eventBus.onDeviceInterview(this, this.onZigbeeEvent);
        this.eventBus.onDeviceMessage(this, this.onZigbeeEvent);
        /*this.eventBus.onScenesChanged(this, this.onScenesChanged);
        this.eventBus.onEntityOptionsChanged(this, async (data) => await this.discover(data.entity));
        this.eventBus.onExposesChanged(this, async (data) => await this.discover(data.device));

        await this.mqtt.subscribe(this.statusTopic);*/

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

        logger.debug(`Discovering entities to Home Assistant in ${discoverWait}s`);
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
       logger.debug(`Zigbee event received for '${data.device.name}'`);
    }

    @bind async onEntityRemoved(data: eventdata.EntityRemoved): Promise<void> {
        logger.debug(`Clearing Home Assistant discovery for '${data.name}'`);
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
    private mqtt: Mqtt;
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

    async remove_topic(topic: string): Promise<void> {
        await this.mqtt.publish(topic, "");
    }

};

export class HomieDevice {

    protected homie: HomieHelper;
    protected nodes: HomieNode[];
    protected id: string;
    protected name: string;

    constructor(homie: HomieHelper, id: string, name: string) {
        this.homie = homie;
        this.id = id;
        this.name = name;
        this.nodes = []
    }

    async addAttribute(attribute: HomieNode): Promise<void> {
        this.nodes.push(attribute);
    }

    async expose(base_list: string[]): Promise<void> {
        for (const node of this.nodes) {
            await node.expose(base_list);
        }
    };
};

export class HomieNode {

    protected homie: HomieHelper;
    protected properties: HomieProperty[];
    protected id: string;
    public readonly name: string;

    constructor(homie: HomieHelper, id: string, name: string, properties: HomieProperty[]) {
        this.homie = homie;
        this.id = id;
        this.name = name;
        this.properties = properties;
    }

    async expose(base_list: string[]): Promise<void> {
        base_list[-1] = this.id

        base_list.push("$name")
        this.homie.publish(base_list, this.name)

        base_list[-1] = "$properties"
        this.homie.publish(base_list, this.properties.map(({ name }) => ({ name })).join(","));

        for (const property of this.properties) {
            await property.expose(base_list);
        }
    };
};


export class HomieProperty {
    private homie: HomieHelper;
    private propertyId: string;
    public readonly name: string;
    private type: string;
    private unit: string;
    private format: string;
    private value: any;
    private settable: boolean;
    private retained: boolean;

    // Quick access to value topic
    private value_topic: string = "";
    // store build topics, avoids to rebuild when deleting device.
    private topicsToRemove: string[] = [];

    constructor(homie: HomieHelper, propertyId: string, name: string, type: string, unit: string, format: string, init_value: any, retained: boolean, settable: boolean) {
        this.homie = homie;
        this.propertyId = propertyId;
        this.name = name;
        this.type = type;
        this.unit = unit;
        this.format = format;
        this.retained = retained;
        this.settable = settable;

        this.value = init_value.toString();
    }

    async expose(base_list: string[]): Promise<void> {

        base_list[-1] = this.propertyId
        this.value_topic = await this.homie.publish(base_list, this.value)

        base_list.push("$name");
        this.topicsToRemove.push(await this.homie.publish(base_list, this.name));

        base_list[-1] = "$datatype";
        this.homie.publish(base_list, this.type);

        if (this.unit != null) {
            base_list[-1] = "$unit";
            this.homie.publish(base_list, this.unit);
        }
        if (this.format != null) {
            base_list[-1] = "$format";
            this.homie.publish(base_list, this.format);
        }

        if (!this.retained) {
            base_list[-1] = "$retained";
            this.homie.publish(base_list, "false");
        }

        if (this.settable) {
            base_list[-1] = "$settable";
            this.homie.publish(base_list, "true");
        }
    }

    async remove(): Promise<void> {
        this.homie.remove_topic(this.value_topic);
        for (var topic of this.topicsToRemove) {
            this.homie.remove_topic(topic);
        }

    }
};

export default Homie;
