import React, {
  FC,
  UIEvent,
  useRef,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  ReactElement,
} from "react";
import { FetchMessagesResponse, UUIDMetadataObject, ObjectCustom } from "pubnub";
import { usePubNub } from "pubnub-react";
import { useAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { MessageEnvelope, isFileMessage, EmojiPickerElementProps, StandardMessage } from "../types";
import {
  CurrentChannelAtom,
  CurrentChannelMessagesAtom,
  CurrentChannelPaginationAtom,
  UsersMetaAtom,
  ThemeAtom,
  RetryFunctionAtom,
  ErrorFunctionAtom,
} from "../state-atoms";
import { useOuterClick } from "../helpers";
import SpinnerIcon from "../icons/spinner.svg";
import EmojiIcon from "../icons/emoji.svg";
import ArrowDownIcon from "../icons/arrow-down.svg";
import "./message-list.scss";
import MessageActions from "./message-actions";
import MessageEditor from "./message-editor";
import { MessageRenderer } from "./message-renderer";

export interface MessageRendererProps {
  isOwn: boolean;
  message: MessageEnvelope;
  time: string;
  date: string;
  editedText: string;
  user?: UUIDMetadataObject<ObjectCustom>;
}

export interface MessageListProps {
  children?: ReactNode;
  /** Option to fetch past messages from storage and display them on a channel. Set a number from "0" to "100". Defaults to "0" to fetch no messages from storage. */
  fetchMessages?: number;
  /** Option to enable rendering reactions that were added to messages. Make sure to also set up reactionsPicker when this option is enabled. */
  enableReactions?: boolean;
  /** Option to enable date instead of time for each message. */
  enableDate?: boolean;
  /** Option to provide custom welcome messages to replace the default ones. Set to "false" to disable it. */
  welcomeMessages?: false | MessageEnvelope | MessageEnvelope[];
  /** Option to enable message reactions. Pass it in the emoji picker component. For more details, refer to the Emoji Pickers section in the docs. */
  reactionsPicker?: ReactElement<EmojiPickerElementProps>;
  /** Option to provide an extra actions renderer to add custom action buttons to each message. */
  extraActionsRenderer?: (message: MessageEnvelope) => JSX.Element;
  /** Option to provide a custom message item renderer if themes and CSS variables aren't enough. */
  messageRenderer?: (props: MessageRendererProps) => JSX.Element;
  /** Option to provide a custom message bubble renderer if themes and CSS variables aren't enough. */
  bubbleRenderer?: (props: MessageRendererProps) => JSX.Element;
  /** Option to render only selected messages. */
  filter?: (message: MessageEnvelope) => boolean;
  /** Callback run on a list scroll. */
  onScroll?: (event: UIEvent<HTMLElement>) => unknown;
}

/**
 * Fetches historical messages using the scrolling pagination pattern and subscribes to the current
 * channel to stay up to date with new messages.
 *
 * It also displays data in an interactive list, including
 * user names, avatars, the time when a message was sent, and attachments (links, images) and allows to react to
 * messages with emojis and to show those reactions immediately.
 */
export const MessageList: FC<MessageListProps> = (props: MessageListProps) => {
  const pubnub = usePubNub();

  const [channel] = useAtom(CurrentChannelAtom);
  const [users] = useAtom(UsersMetaAtom);
  const [theme] = useAtom(ThemeAtom);
  const [retryObj] = useAtom(RetryFunctionAtom);
  const [onErrorObj] = useAtom(ErrorFunctionAtom);
  const [messages] = useAtom(CurrentChannelMessagesAtom);
  const [paginationEnd] = useAtom(CurrentChannelPaginationAtom);
  const retry = retryObj.function;
  const onError = onErrorObj.function;

  const [scrolledBottom, setScrolledBottom] = useState(true);
  const [prevMessages, setPrevMessages] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [fetchingMessages, setFetchingMessages] = useState(false);
  const [picker, setPicker] = useState<ReactElement>();
  const [emojiPickerShown, setEmojiPickerShown] = useState(false);
  const [reactingToMessage, setReactingToMessage] = useState(null);

  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useOuterClick((event) => {
    if ((event.target as Element).closest(".pn-msg__reactions-toggle")) return;
    setEmojiPickerShown(false);
  });
  const listSizeObserver = useRef(new ResizeObserver(() => handleListMutations()));
  const listMutObserver = useRef(new MutationObserver(() => handleListMutations()));
  const spinnerIntObserver = useRef(
    new IntersectionObserver((e) => e[0].isIntersecting === true && fetchMoreHistory())
  );
  const bottomIntObserver = useRef(
    new IntersectionObserver((e) => handleBottomIntersection(e[0].isIntersecting))
  );

  /*
  /* Helper functions
  */

  const scrollToBottom = useCallback(() => {
    if (!endRef.current) return;
    setScrolledBottom(true);
    endRef.current.scrollIntoView({ block: "end" });
  }, []);

  const setupSpinnerObserver = () => {
    if (!spinnerRef.current) return;
    spinnerIntObserver.current.observe(spinnerRef.current);
  };

  const setupListObservers = () => {
    if (!listRef.current) return;

    listSizeObserver.current.disconnect();
    listSizeObserver.current.observe(listRef.current);

    listMutObserver.current.disconnect();
    listMutObserver.current.observe(listRef.current, { childList: true });
  };

  const isOwnMessage = (uuid: string) => {
    return pubnub.getUUID() === uuid;
  };

  /*
  /* Commands
  */

  const fetchHistory = async () => {
    if (!props.fetchMessages) return;
    try {
      setFetchingMessages(true);
      const history = await retry(() =>
        pubnub.fetchMessages({
          channels: [channel],
          count: props.fetchMessages,
          includeMessageActions: true,
        })
      );
      handleHistoryFetch(history);
      scrollToBottom();
      setupSpinnerObserver();
    } catch (e) {
      onError(e);
    } finally {
      setFetchingMessages(false);
    }
  };

  /** useAtomCallback to accesses jotai atoms inside of a Intersection Observer callback */
  const fetchMoreHistory = useAtomCallback(
    useCallback(async (get) => {
      const channel = get(CurrentChannelAtom);
      const retryObj = get(RetryFunctionAtom);
      const errorObj = get(ErrorFunctionAtom);
      const messages = get(CurrentChannelMessagesAtom);
      const retry = retryObj.function;
      const onError = errorObj.function;
      const firstMessage = listRef.current?.querySelector(".pn-msg");

      if (!messages.length) return;

      try {
        const history = await retry(() =>
          pubnub.fetchMessages({
            channels: [channel],
            count: props.fetchMessages,
            start: (messages?.[0].timetoken as number) || undefined,
            includeMessageActions: true,
          })
        );
        handleHistoryFetch(history);
        if (firstMessage) firstMessage.scrollIntoView();
      } catch (e) {
        onError(e);
      }
    }, [])
  );

  const addReaction = (reaction: string, messageTimetoken) => {
    try {
      pubnub.addMessageAction({
        channel,
        messageTimetoken,
        action: {
          type: "reaction",
          value: reaction,
        },
      });
    } catch (e) {
      onError(e);
    }
  };

  const removeReaction = (reaction: string, messageTimetoken, actionTimetoken) => {
    try {
      pubnub.removeMessageAction({ channel, messageTimetoken, actionTimetoken });
    } catch (e) {
      onError(e);
    }
  };

  const updateMessage = async (value: string, messageTimetoken) => {
    try {
      await pubnub.addMessageAction({
        channel,
        messageTimetoken,
        action: {
          type: "updated",
          value,
        },
      });
    } catch (e) {
      onError(e);
    }
  };

  const deleteMessage = async (messageTimetoken) => {
    try {
      await pubnub.addMessageAction({
        channel,
        messageTimetoken,
        action: {
          type: "deleted",
          value: ".",
        },
      });
    } catch (e) {
      onError(e);
    }
  };

  const fetchFileUrl = (envelope: MessageEnvelope) => {
    if (!isFileMessage(envelope.message)) return envelope;

    try {
      const url = pubnub.getFileUrl({
        channel: envelope.channel,
        id: envelope.message.file.id,
        name: envelope.message.file.name,
      });

      envelope.message.file.url = url;
    } catch (e) {
      onError(e);
    } finally {
      return envelope;
    }
  };

  /*
  /* Event handlers
  */

  const handleEmojiInsertion = useCallback(
    (emoji: { native: string }) => {
      try {
        if (!("native" in emoji)) return;
        addReaction(emoji.native, reactingToMessage);
        setEmojiPickerShown(false);
      } catch (e) {
        onError(e);
      }
    },
    [reactingToMessage]
  );

  const handleBottomIntersection = (isIntersecting: boolean) => {
    try {
      if (isIntersecting) setUnreadMessages(0);
      setScrolledBottom(isIntersecting);
    } catch (e) {
      onError(e);
    }
  };

  const handleListMutations = () => {
    try {
      scrolledBottom && scrollToBottom();
    } catch (e) {
      onError(e);
    }
  };

  const handleHistoryFetch = useAtomCallback(
    useCallback((get, set, response: FetchMessagesResponse) => {
      const channel = get(CurrentChannelAtom);
      const messages = get(CurrentChannelMessagesAtom);
      const newMessages =
        ((response?.channels[channel] || []).map((m) =>
          m.messageType === 4 ? fetchFileUrl(m) : m
        ) as MessageEnvelope[]) || [];
      const allMessages = [...messages, ...newMessages].sort(
        (a, b) => (a.timetoken as number) - (b.timetoken as number)
      );
      setEmojiPickerShown(false);
      setPrevMessages(allMessages);
      set(CurrentChannelMessagesAtom, allMessages);
      set(
        CurrentChannelPaginationAtom,
        !allMessages.length || newMessages.length !== props.fetchMessages
      );
      if (response.more) {
        fetchMoreHistory();
      }
    }, [])
  );

  const handleOpenReactions = (event: React.MouseEvent, timetoken) => {
    try {
      let newPickerTopPosition =
        listRef.current.scrollTop -
        listRef.current.getBoundingClientRect().top +
        (event.target as HTMLElement).getBoundingClientRect().y;
      if (newPickerTopPosition > pickerRef.current.offsetHeight) {
        newPickerTopPosition += (event.target as HTMLElement).getBoundingClientRect().height;
        newPickerTopPosition -= pickerRef.current.offsetHeight;
      }
      pickerRef.current.style.top = `${newPickerTopPosition}px`;

      setEmojiPickerShown(true);
      setReactingToMessage(timetoken);
    } catch (e) {
      onError(e);
    }
  };

  /*
  /* Lifecycle
  */

  useEffect(() => {
    if (!pubnub || !channel) return;
    if (!messages?.length) fetchHistory();
    setupSpinnerObserver();
    setupListObservers();
  }, [channel]);

  useEffect(() => {
    if (React.isValidElement(props.reactionsPicker)) {
      setPicker(React.cloneElement(props.reactionsPicker, { onSelect: handleEmojiInsertion }));
    }
  }, [props.reactionsPicker, handleEmojiInsertion]);

  useEffect(() => {
    if (!messages?.length) return;

    const messagesFromListener = messages.length - prevMessages.length;

    if (scrolledBottom) scrollToBottom();
    if (!scrolledBottom && messagesFromListener)
      setUnreadMessages(unreadMessages + messagesFromListener);

    setPrevMessages(messages);
  }, [messages]);

  /*
  /* Renderers
  */

  const renderWelcomeMessages = () => {
    if (!props.welcomeMessages) return;
    return Array.isArray(props.welcomeMessages) ? (
      props.welcomeMessages.map((m) => <Item key={m.uuid} envelope={m} />)
    ) : (
      <Item envelope={props.welcomeMessages!} />
    );
  };

  const Item = ({ envelope }: { envelope: MessageEnvelope }) => {
    const uuid = envelope.uuid || envelope.publisher || "";
    const isOwn = isOwnMessage(uuid);
    const currentUserClass = isOwn ? "pn-msg--own" : "";
    const actions = envelope.actions;
    const deleted = !!Object.keys(actions?.deleted || {}).length;
    const isFile = isFileMessage(envelope.message);
    const message = (isFile ? envelope.message.message : envelope.message) as StandardMessage;
    const canEdit = isOwn && !isFile;
    const [edit, setEdit] = React.useState(false);

    const onEditHandler = (value: string) => {
      updateMessage(value, envelope.timetoken);
      setEdit(false);
    };

    const onDeleteHandler = () => {
      deleteMessage(envelope.timetoken);
    };

    if (deleted) return null;

    return (
      <div className={`pn-msg ${currentUserClass}`} key={envelope.timetoken}>
        {edit ? (
          <MessageEditor envelope={envelope} onSubmit={onEditHandler} />
        ) : (
          <MessageRenderer
            envelope={envelope}
            messageListProps={props}
            scrollToBottom={scrollToBottom}
            scrolledBottom={scrolledBottom}
            renderReactions={renderReactions}
          />
        )}
        <div className="pn-msg__actions">
          {props.extraActionsRenderer && props.extraActionsRenderer(envelope)}
          {props.reactionsPicker && message?.type !== "welcome" && (
            <div
              className="pn-msg__reactions-toggle"
              title="Add a reaction"
              onClick={(e) => {
                emojiPickerShown && reactingToMessage === envelope.timetoken
                  ? setEmojiPickerShown(false)
                  : handleOpenReactions(e, envelope.timetoken);
              }}
            >
              <EmojiIcon />
            </div>
          )}
          <MessageActions
            canEdit={canEdit}
            onEdit={() => setEdit(!edit)}
            canDelete={isOwn}
            onDelete={onDeleteHandler}
          />
        </div>
      </div>
    );
  };

  const renderReactions = (envelope: MessageEnvelope) => {
    const reactions = envelope.actions?.reaction;
    if (!reactions) return;

    return (
      <div className="pn-msg__reactions">
        {Object.keys(reactions).map((reaction) => {
          const instances = reactions[reaction];
          const instancesLimit = 99;
          const instancesLimited = instances.slice(0, instancesLimit);
          const instancesOverLimit = instances.length - instancesLimited.length;
          const userReaction = instances?.find((i) => i.uuid === pubnub.getUUID());
          const userNames = instancesLimited.map((i) => {
            const user = users.find((u) => u.id === i.uuid);
            return user ? user.name : i.uuid;
          });
          const tooltipContent = `
            ${userNames.join(", ")}
            ${instancesOverLimit ? `and ${instancesOverLimit} more` : ``}
          `;

          return (
            <div
              className={`pn-tooltip pn-msg__reaction ${
                userReaction ? "pn-msg__reaction--active" : ""
              }`}
              key={reaction}
              data-tooltip={tooltipContent}
              onClick={() => {
                userReaction
                  ? removeReaction(reaction, envelope.timetoken, userReaction.actionTimetoken)
                  : addReaction(reaction, envelope.timetoken);
              }}
            >
              {reaction} {instancesLimited.length}
              {instancesOverLimit ? "+" : ""}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`pn-msg-list pn-msg-list--${theme}`}>
      {unreadMessages > 0 && (
        <div className="pn-msg-list__unread" onClick={() => scrollToBottom()}>
          {unreadMessages} new message{unreadMessages > 1 ? "s" : ""} <ArrowDownIcon />
        </div>
      )}

      <div className="pn-msg-list-scroller" onScroll={props.onScroll} ref={listRef}>
        {!!props.fetchMessages && !paginationEnd && (
          <span ref={spinnerRef} className="pn-msg-list__spinner">
            <SpinnerIcon />
          </span>
        )}

        <div className="pn-msg-list__spacer" />

        {(!props.fetchMessages || (!fetchingMessages && !messages.length)) &&
          renderWelcomeMessages()}
        {messages &&
          messages.map((m) => {
            return <Item key={m.timetoken} envelope={m} />;
          })}

        {props.children}

        <div className="pn-msg-list__bottom-ref" ref={endRef}></div>

        {props.reactionsPicker && (
          <div
            className={`pn-msg-list__emoji-picker ${
              !emojiPickerShown && "pn-msg-list__emoji-picker-hidden"
            }`}
            ref={pickerRef}
          >
            {picker}
          </div>
        )}
      </div>
    </div>
  );
};

MessageList.defaultProps = {
  enableReactions: false,
  enableDate: false,
  fetchMessages: 0,
};
