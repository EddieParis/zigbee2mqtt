import Extension from "./extension";
import * as settings from "../util/settings";
import utils from "lib/util/utils";
import logger from "../util/logger";
import bind from "bind-decorator";

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
        if (settings.get().advanced.output === "attribute") {
            throw new Error("Home Assistant integration is not possible with attribute output!");
        }
        logger.info("Homie extension initialized");
        console.log("Homie extension initialized");
    }
    override async start(): Promise<void> {
        if (!settings.get().advanced.cache_state) {
            logger.warning("In order for Home Assistant integration to work properly set `cache_state: true");
        }

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

export class HomieDevice {
    private nodes: HomieNode[];
    public id: string;
    public name: string;

    constructor( id: string,  name: string) {
        this.id = id;
        this.name = name;
        this.nodes = []
    }

    async addAttribute(attribute: HomieNode): Promise<void> {
        this.nodes.push(attribute);
    }
};

export class HomieNode {
    /*properties: HomieProperty[];

    constructor(properties: HomieProperty[]) {
        this.properties = properties;
    }

    async expose(homie: Mqtt, base_list: string[]): Promise<void> {
        for (const property of this.properties) {
            await property.expose(homie, base_list);
        }
    };*/
};

/*
export class HomieProperty {
    private name: string;
    private value: any;
    private unit: string;
    private datatype: string;
    private min: number;
    private max: number;
    private settable: boolean;
    private retained: boolean;
    private property_id: string;
    private init_value: any;
    private value_topic: string;
    private value_set_cb?: (value: any) => void;
    private homie?: Mqtt;

    private topicsToRemove: string[] = [];

    constructor(name: string, value: any) {
        this.name = name;
        this.value = value;
    }

    async expose(homie:Mqtt, base_list: string[]): Promise<boolean> {
        this.homie = homie

        base_list[-1] = this.property_id
        this.value_topic = this.homie.publish(base_list, this.init_value)

        base_list.push("$name")
        this.homie.publish(base_list, this.name)

        base_list[-1] = "$datatype"
        this.homie.publish(base_list, this.datatype)

        if (this.unit != null) {
            base_list[-1] = "$unit"
            this.homie.publish(base_list, this.unit)
        }
        if (this.min != null) {
            base_list[-1] = "$format"
            this.homie.publish(base_list, `${this.min}..${this.max}`)
        }

        if (!this.retained) {
            base_list[-1] = "$retained"
            this.homie.publish(base_list, "false")
        }

        if (this.value_set_cb) {
            base_list[-1] = "$settable"
            this.homie.publish(base_list, "true")
            return true
        }
        return false

};
*/

export default Homie;