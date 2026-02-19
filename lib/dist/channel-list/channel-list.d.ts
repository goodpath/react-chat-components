import { FC, ReactNode } from "react";
import { ChannelMetadataObject, ObjectCustom } from "pubnub";
import "./channel-list.scss";
export interface ChannelListProps {
    children?: ReactNode;
    /** Option to pass a list of channels, including metadata, to render on the list. */
    channels: ChannelMetadataObject<ObjectCustom>[] | string[];
    /** Channels are sorted alphabetically by default, you can override that by providing a sorter function */
    sort?: (a: ChannelMetadataObject<ObjectCustom>, b: ChannelMetadataObject<ObjectCustom>) => -1 | 0 | 1;
    /** Option to provide an extra actions renderer to add custom action buttons to each channel. */
    extraActionsRenderer?: (channel: ChannelMetadataObject<ObjectCustom>) => JSX.Element;
    titleRenderer?: (channel: ChannelMetadataObject<ObjectCustom>) => JSX.Element;
    /** Option to provide a custom channel renderer to override default themes and CSS variables. */
    channelRenderer?: (channel: ChannelMetadataObject<ObjectCustom>) => JSX.Element;
    /** Callback run when a user clicked one of the channels. Can be used to switch the current channel. */
    onChannelSwitched?: (channel: ChannelMetadataObject<ObjectCustom>) => unknown;
    /** Provide a custom sorter function to sort the channels. */
    channelSorter?: (a: ChannelMetadataObject<ObjectCustom>, b: ChannelMetadataObject<ObjectCustom>) => number;
}
/**
 * Renders an interactive list of channels.
 *
 * It can represent all channels of the application, only
 * channels joined by the current user, all channels available to be joined, or whatever else is
 * passed into it. A common pattern in chat applications is to render two instances of the
 * component - one visible all the time to show joined channels, and another one hidden inside a
 * modal with channels available to join. Make sure to handle the onChannelSwitched event to switch
 * the current channel passed to the Chat provider.
 */
export declare const ChannelList: FC<ChannelListProps>;
