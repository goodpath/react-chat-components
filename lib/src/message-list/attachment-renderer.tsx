import React from "react";
import { ImageAttachment, LinkAttachment } from "../types";

export const AttachmentRenderer = ({ attachment }: Props) => {
  return (
    <div className="pn-msg__attachments">
      {attachment.type === "image" && (
        <img className="pn-msg__image" src={attachment.image?.source} />
      )}

      {attachment.type === "link" && (
        <a
          className="pn-msg__link"
          href={attachment.provider?.url}
          target="_blank"
          rel="noreferrer noopener"
        >
          <img src={attachment.image?.source} />
          <div>
            <p className="pn-msg__link-name">
              <img src={attachment.icon?.source} />
              {attachment.provider?.name}
            </p>
            <p className="pn-msg__link-title">{attachment.title}</p>
            <p className="pn-msg__link-description">{attachment.description}</p>
          </div>
        </a>
      )}
    </div>
  );
};

type Props = {
  attachment: ImageAttachment | LinkAttachment;
};
