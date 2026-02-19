import { usePubNub } from "pubnub-react";
import React, { memo } from "react";
import { getLastMessageUpdate, getNameInitials, getPredefinedColor } from "../helpers";
import { isFilePayload, MessageEnvelope } from "../types";
import { FileRenderer } from "./file-renderer";
import { useAtom } from "jotai";
import { UsersMetaAtom } from "../state-atoms";
import { MessageListProps } from "./message-list";
import { AttachmentRenderer } from "./attachment-renderer";

const getTime = (timestamp: number) => {
  const ts = String(timestamp);
  const date = new Date(parseInt(ts) / 10000);
  const formatter = new Intl.DateTimeFormat([], { timeStyle: "short" });
  return formatter.format(date);
};

const getDate = (timestamp: number) => {
  const ts = String(timestamp);
  const date = new Date(parseInt(ts) / 10000);
  const formatter = new Intl.DateTimeFormat([], { dateStyle: "full", timeStyle: "short" });
  return formatter.format(date);
};

export const MessageRenderer = memo(
  ({ envelope, messageListProps, scrollToBottom, scrolledBottom, renderReactions }: Props) => {
    const pubnub = usePubNub();
    const [users] = useAtom(UsersMetaAtom);

    const isOwnMessage = (uuid: string) => {
      return pubnub.getUUID() === uuid;
    };
    const getUser = (uuid: string) => {
      return users.find((u) => u.id === uuid);
    };

    const uuid = envelope.uuid || envelope.publisher || "";
    const time = getTime(envelope.timetoken as number);
    const date = getDate(envelope.timetoken as number);
    const isOwn = isOwnMessage(uuid);
    const message = isFilePayload(envelope.message) ? envelope.message.message : envelope.message;
    // Always look up user by UUID first. Only fall back to message.sender if:
    // 1. User not found in users array, AND
    // 2. message.sender is a proper user object (has name property), not just a string UUID
    const lookupUser = getUser(uuid);
    const senderIsUserObject = message?.sender && typeof message.sender === "object" && "name" in message.sender;
    const user = lookupUser || (senderIsUserObject ? message.sender : undefined);
    const attachments = message?.attachments || [];

    // Check for true sender (when message was sent as a persona)
    const trueSenderId = envelope.meta?.trueSenderId as string | undefined;
    const trueSenderName = envelope.meta?.trueSenderName as string | undefined;
    const showTrueSender = trueSenderId && trueSenderId !== uuid;
    const trueSenderDisplay = showTrueSender
      ? (trueSenderName || getUser(trueSenderId)?.name || trueSenderId)
      : null;
    const file = isFilePayload(envelope.message) && envelope.message.file;
    const editedText = getLastMessageUpdate(envelope);

    if (
      messageListProps.messageRenderer &&
      (messageListProps.filter ? messageListProps.filter(envelope) : true)
    )
      return messageListProps.messageRenderer({
        message: envelope,
        user,
        time,
        date,
        isOwn,
        editedText,
      });

    return (
      <>
        <div className="pn-msg__avatar" style={{ backgroundColor: getPredefinedColor(uuid) }}>
          {user?.profileUrl ? (
            <img src={user.profileUrl} alt="User avatar" />
          ) : (
            getNameInitials(user?.name || uuid)
          )}
        </div>
        <div className="pn-msg__main">
          <div className="pn-msg__content">
            <div className="pn-msg__title">
              <span className="pn-msg__author">
                {user?.name || uuid}
                {trueSenderDisplay && <span className="pn-msg__true-sender"> (sent by {trueSenderDisplay})</span>}
              </span>
              <span className="pn-msg__time">{messageListProps.enableDate ? date : time}</span>
            </div>
            {message?.text &&
              (messageListProps.bubbleRenderer &&
              (messageListProps.filter ? messageListProps.filter(envelope) : true) ? (
                messageListProps.bubbleRenderer({
                  message: envelope,
                  user,
                  time,
                  date,
                  isOwn,
                  editedText,
                })
              ) : (
                <div className="pn-msg__bubble">{editedText || message?.text}</div>
              ))}
          </div>
          <div className="pn-msg__extras">
            {file && file.name ? (
              <FileRenderer
                file={file}
                scrollToBottom={scrollToBottom}
                scrolledBottom={scrolledBottom}
              />
            ) : null}
            {attachments.map((attachment, i) => (
              <AttachmentRenderer key={i} attachment={attachment} />
            ))}
            {messageListProps.enableReactions && renderReactions(envelope)}
          </div>
        </div>
      </>
    );
  }
);

type Props = {
  envelope: MessageEnvelope;
  messageListProps: MessageListProps;
  scrollToBottom: () => void;
  scrolledBottom: boolean;
  renderReactions: (envelope: MessageEnvelope) => JSX.Element;
};
