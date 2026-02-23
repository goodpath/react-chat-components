import React, {
  FC,
  UIEvent,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  ReactNode,
  ReactElement,
} from "react";
import { FetchMessagesResponse, UUIDMetadataObject, ObjectCustom } from "pubnub";
import { usePubNub } from "pubnub-react";
import { useAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { MessageEnvelope, isFilePayload, EmojiPickerElementProps, MessagePayload } from "../types";
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
  /** Optional callback to determine if the current user can edit a message. If not provided, defaults to checking if the user is the message owner. */
  canEditMessage?: (envelope: MessageEnvelope) => boolean;
  /** Optional callback to determine if the current user can delete a message. If not provided, defaults to checking if the user is the message owner. */
  canDeleteMessage?: (envelope: MessageEnvelope) => boolean;
  /** Timetoken from which messages should be visually marked as unread. Shows a divider line and highlights messages at or after this timetoken. */
  unreadFromTimetoken?: string | number;
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
  // Track whether we need initial scroll (set to false after first scroll)
  const needsInitialScroll = useRef(true);
  // Track scrolledBottom in a ref for use in callbacks without stale closure issues
  const scrolledBottomRef = useRef(true);
  // Track previous unreadFromTimetoken to detect changes
  const prevUnreadFromTimetokenRef = useRef(props.unreadFromTimetoken);
  // Store scroll anchor info to restore after unread state changes
  // We save which message was at the top of the viewport and its offset
  const savedScrollAnchorRef = useRef<{ timetoken: string; offsetFromTop: number } | null>(null);
  // Flag to temporarily ignore intersection observer during scroll restore
  const isRestoringScrollRef = useRef(false);
  // Track if we're in the initial settling phase (container size may change as siblings render)
  const isInitialSettlingRef = useRef(false);
  // ResizeObserver to re-scroll when container size changes during initial settling
  const listSizeObserver = useRef(
    new ResizeObserver(() => {
      // Re-scroll to bottom when container size changes and we should be at the bottom
      if (isInitialSettlingRef.current && scrolledBottomRef.current && endRef.current) {
        endRef.current.scrollIntoView({ behavior: "auto", block: "end" });
      }
    })
  );
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const listMutObserver = useRef(new MutationObserver(() => {}));
  // IntersectionObservers will be initialized in setupObservers with proper root
  const spinnerIntObserver = useRef<IntersectionObserver | null>(null);
  const bottomIntObserver = useRef<IntersectionObserver | null>(null);

  /*
  /* Helper functions
  */

  const scrollToBottom = useCallback(() => {
    if (!listRef.current) return;
    scrolledBottomRef.current = true;

    const doScroll = () => {
      // Use scrollIntoView for better compatibility with Dialog containers
      if (endRef.current) {
        endRef.current.scrollIntoView({ behavior: "auto", block: "end" });
      }
      // Also set scrollTop as fallback
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    };

    // Enable initial settling mode - ResizeObserver will re-scroll if container size changes
    isInitialSettlingRef.current = true;

    // Use double requestAnimationFrame to wait for Dialog/container transitions
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        doScroll();
        // Disable settling mode after layout has stabilized (500ms should be enough)
        setTimeout(() => {
          isInitialSettlingRef.current = false;
        }, 500);
      });
    });
  }, []);

  const setupSpinnerObserver = () => {
    if (!spinnerRef.current || !listRef.current) return;
    spinnerIntObserver.current?.disconnect();
    // Use listRef as root so observer works correctly inside Dialog containers
    spinnerIntObserver.current = new IntersectionObserver(
      (e) => e[0].isIntersecting === true && fetchMoreHistory(),
      { root: listRef.current }
    );
    spinnerIntObserver.current.observe(spinnerRef.current);
  };

  const setupBottomObserver = () => {
    if (!endRef.current || !listRef.current) return;
    bottomIntObserver.current?.disconnect();
    // Use listRef as root so observer works correctly inside Dialog containers
    bottomIntObserver.current = new IntersectionObserver(
      (e) => handleBottomIntersection(e[0].isIntersecting),
      { root: listRef.current }
    );
    bottomIntObserver.current.observe(endRef.current);
  };

  const setupListObservers = () => {
    if (!listRef.current) return;

    listSizeObserver.current.disconnect();
    listSizeObserver.current.observe(listRef.current);

    listMutObserver.current.disconnect();
    listMutObserver.current.observe(listRef.current, { childList: true });

    // Set up bottom observer to track scroll position
    setupBottomObserver();
  };

  const isOwnMessage = (envelope: MessageEnvelope) => {
    const currentUuid = pubnub.getUUID();
    const publisherUuid = envelope.uuid || envelope.publisher || "";
    // Check if the message was sent by the current user, either directly
    // or via a persona (trueSenderId in meta indicates the actual sender)
    const trueSenderId = envelope.meta?.trueSenderId as string | undefined;
    return currentUuid === publisherUuid || currentUuid === trueSenderId;
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
          includeMeta: true,
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
            includeMeta: true,
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
    if (!isFilePayload(envelope.message)) return envelope;

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
      // Ignore intersection events while restoring scroll position
      if (isRestoringScrollRef.current) return;
      if (isIntersecting) setUnreadMessages(0);
      scrolledBottomRef.current = isIntersecting;
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
      // Deduplicate by timetoken to prevent duplicate messages
      const existingTimetokens = new Set(messages.map((m) => String(m.timetoken)));
      const uniqueNewMessages = newMessages.filter(
        (m) => !existingTimetokens.has(String(m.timetoken))
      );
      const allMessages = [...messages, ...uniqueNewMessages].sort(
        (a, b) => (a.timetoken as number) - (b.timetoken as number)
      );
      setEmojiPickerShown(false);
      setPrevMessages(allMessages);
      set(CurrentChannelMessagesAtom, allMessages);
      set(
        CurrentChannelPaginationAtom,
        !allMessages.length || newMessages.length !== props.fetchMessages
      );
      if ("more" in response && (response as { more?: boolean }).more) {
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
    needsInitialScroll.current = true; // Reset for new channel
    if (!messages?.length) fetchHistory();
    setupSpinnerObserver();
    setupListObservers();

    // Cleanup observers on unmount or channel change
    return () => {
      spinnerIntObserver.current?.disconnect();
      bottomIntObserver.current?.disconnect();
      listSizeObserver.current.disconnect();
      listMutObserver.current.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  useEffect(() => {
    if (React.isValidElement(props.reactionsPicker)) {
      setPicker(React.cloneElement(props.reactionsPicker, { onEmojiSelect: handleEmojiInsertion }));
    }
  }, [props.reactionsPicker, handleEmojiInsertion]);

  useEffect(() => {
    if (!messages?.length) return;

    const newMessageCount = messages.length - prevMessages.length;
    const newestMessage = messages[messages.length - 1];
    const isNewestOwn = newestMessage && isOwnMessage(newestMessage);

    // Scroll to bottom when:
    // 1. Initial load (needsInitialScroll)
    // 2. User sent a message (always scroll for own messages)
    // 3. New message arrived and user is at bottom
    if (
      needsInitialScroll.current ||
      isNewestOwn ||
      (scrolledBottomRef.current && newMessageCount > 0)
    ) {
      needsInitialScroll.current = false;
      scrollToBottom();
    } else if (newMessageCount > 0) {
      setUnreadMessages((prev) => prev + newMessageCount);
    }

    setPrevMessages(messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Preserve scroll position when unreadFromTimetoken changes (marking read/unread)
  // Use useLayoutEffect to restore scroll position after layout changes
  useLayoutEffect(() => {
    // Restore scroll to the same message that was visible before the change
    if (savedScrollAnchorRef.current !== null && listRef.current) {
      isRestoringScrollRef.current = true;
      const { timetoken, offsetFromTop } = savedScrollAnchorRef.current;
      const messageEl = listRef.current.querySelector(`[data-timetoken="${timetoken}"]`);
      if (messageEl) {
        const messageRect = messageEl.getBoundingClientRect();
        const listRect = listRef.current.getBoundingClientRect();
        const currentOffset = messageRect.top - listRect.top;
        const scrollAdjustment = currentOffset - offsetFromTop;
        listRef.current.scrollTop += scrollAdjustment;
      }
      // Clear after a frame to allow normal scroll behavior to resume
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          savedScrollAnchorRef.current = null;
          isRestoringScrollRef.current = false;
        });
      });
    }
  }, [props.unreadFromTimetoken]);

  // Save scroll anchor when unreadFromTimetoken is about to change
  // This runs during render, before useLayoutEffect
  if (props.unreadFromTimetoken !== prevUnreadFromTimetokenRef.current) {
    if (listRef.current && savedScrollAnchorRef.current === null) {
      // Find the first message element that is visible in the viewport
      const listRect = listRef.current.getBoundingClientRect();
      const messageEls = Array.from(listRef.current.querySelectorAll("[data-timetoken]"));
      for (let i = 0; i < messageEls.length; i++) {
        const el = messageEls[i];
        const rect = el.getBoundingClientRect();
        // Check if this message is at least partially visible
        if (rect.bottom > listRect.top && rect.top < listRect.bottom) {
          const timetoken = el.getAttribute("data-timetoken");
          if (timetoken) {
            savedScrollAnchorRef.current = {
              timetoken,
              offsetFromTop: rect.top - listRect.top,
            };
            break;
          }
        }
      }
    }
    prevUnreadFromTimetokenRef.current = props.unreadFromTimetoken;
  }

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

  const Item = ({
    envelope,
    isUnread,
    isFirstUnread,
  }: {
    envelope: MessageEnvelope;
    isUnread?: boolean;
    isFirstUnread?: boolean;
  }) => {
    const isOwn = isOwnMessage(envelope);
    const currentUserClass = isOwn ? "pn-msg--own" : "";
    const unreadClass = isUnread ? "pn-msg--unread" : "";
    const actions = envelope.actions;
    const deleted = !!Object.keys(actions?.deleted || {}).length;
    const isFile = isFilePayload(envelope.message);
    const message = (isFile ? envelope.message.message : envelope.message) as MessagePayload;
    const canEditBase = props.canEditMessage ? props.canEditMessage(envelope) : isOwn;
    const canEdit = canEditBase && !isFile;
    const canDelete = props.canDeleteMessage ? props.canDeleteMessage(envelope) : isOwn;
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
      <>
        {/* Always render divider but hide with CSS to avoid DOM mutations that trigger scroll */}
        <div
          className={`pn-msg-list__unread-divider ${
            isFirstUnread ? "" : "pn-msg-list__unread-divider--hidden"
          }`}
        >
          <span>New messages</span>
        </div>
        <div
          className={`pn-msg ${currentUserClass} ${unreadClass}`}
          key={envelope.timetoken}
          data-timetoken={String(envelope.timetoken)}
        >
          {edit ? (
            <MessageEditor envelope={envelope} onSubmit={onEditHandler} />
          ) : (
            <MessageRenderer
              envelope={envelope}
              messageListProps={props}
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
              canDelete={canDelete}
              onDelete={onDeleteHandler}
            />
          </div>
        </div>
      </>
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
        {(() => {
          // Convert unreadFromTimetoken once before the loop for performance
          let unreadFromTTBigInt: bigint | null = null;
          let unreadFromTTNumber: number | null = null;
          let useBigInt = true;
          if (props.unreadFromTimetoken) {
            try {
              unreadFromTTBigInt = BigInt(props.unreadFromTimetoken);
            } catch {
              // Fallback to Number if BigInt conversion fails
              useBigInt = false;
              unreadFromTTNumber = Number(props.unreadFromTimetoken);
            }
          }

          return messages?.map((m, index) => {
            let isUnread = false;
            let isFirstUnread = false;
            if (props.unreadFromTimetoken) {
              if (useBigInt && unreadFromTTBigInt !== null) {
                const msgTT = BigInt(m.timetoken);
                isUnread = msgTT >= unreadFromTTBigInt;

                if (isUnread && index > 0) {
                  const prevMsgTT = BigInt(messages[index - 1].timetoken);
                  isFirstUnread = !(prevMsgTT >= unreadFromTTBigInt);
                } else if (isUnread) {
                  isFirstUnread = true;
                }
              } else if (unreadFromTTNumber !== null) {
                const msgTT = Number(m.timetoken);
                isUnread = msgTT >= unreadFromTTNumber;
                if (isUnread && index > 0) {
                  const prevMsgTT = Number(messages[index - 1].timetoken);
                  isFirstUnread = !(prevMsgTT >= unreadFromTTNumber);
                } else if (isUnread) {
                  isFirstUnread = true;
                }
              }
            }
            return (
              <Item
                key={m.timetoken}
                envelope={m}
                isUnread={isUnread}
                isFirstUnread={isFirstUnread}
              />
            );
          });
        })()}

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
