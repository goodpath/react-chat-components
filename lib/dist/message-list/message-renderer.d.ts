import React from "react";
import { MessageEnvelope } from "../types";
import { MessageListProps } from "./message-list";
export declare const MessageRenderer: React.MemoExoticComponent<({ envelope, messageListProps, scrollToBottom, scrolledBottom, renderReactions }: Props) => JSX.Element>;
declare type Props = {
    envelope: MessageEnvelope;
    messageListProps: MessageListProps;
    scrollToBottom: () => void;
    scrolledBottom: boolean;
    renderReactions: (envelope: MessageEnvelope) => JSX.Element;
};
export {};
