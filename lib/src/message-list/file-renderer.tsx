import React, { memo } from "react";
import { FileAttachment } from "../types";
import { ImageMessage } from "./image-message";
import DownloadIcon from "../icons/download.svg";

export const FileRenderer = memo(({ file, scrollToBottom, scrolledBottom }: Props) => {
  return (
    <div className="pn-msg__file">
      {/\.(svg|gif|jpe?g|tiff?|png|webp|bmp)$/i.test(file.name) ? (
        <ImageMessage file={file} scrolledBottom={scrolledBottom} scrollToBottom={scrollToBottom} />
      ) : (
        <div className="pn-msg__bubble">
          <a
            className="pn-msg__nonImage"
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            download
          >
            {file.name}
            <DownloadIcon className="pn-msg__downloadIcon" />
          </a>
        </div>
      )}
    </div>
  );
});

type Props = {
  file: FileAttachment;
  scrolledBottom: boolean;
  scrollToBottom: () => void;
};
