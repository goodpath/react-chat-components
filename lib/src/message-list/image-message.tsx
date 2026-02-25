import React, { memo, useCallback, useState } from "react";
import SpinnerIcon from "../icons/spinner.svg";
import { FileAttachment } from "../types";

const ImageMessageComponent = ({ file }: Props) => {
  const [loading, setLoading] = useState(true);
  const [style, setStyle] = useState({});

  const onLoadHandler = useCallback((e) => {
    const width = e.target.naturalWidth;
    const height = e.target.naturalHeight;

    if (width >= height) {
      setStyle(styles.imageLandscape);
    } else {
      setStyle(styles.imagePortrait);
    }

    setLoading(false);
    // Note: We intentionally don't scroll here. Scroll only happens on initial chat open.
  }, []);

  return (
    <>
      {loading && (
        <div style={styles.spinnerContainer}>
          <SpinnerIcon />
        </div>
      )}
      <img
        style={loading ? { display: "none" } : style}
        alt={file.name}
        className="pn-msg__image"
        src={file.url}
        onLoad={onLoadHandler}
      />
    </>
  );
};

export const ImageMessage = memo(ImageMessageComponent);
ImageMessage.displayName = "ImageMessage";

const styles = {
  spinnerContainer: {
    width: 400,
    height: 400,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  imageLandscape: { maxWidth: "25rem", height: "auto" },
  imagePortrait: { maxHeight: "25rem", width: "auto" },
};

type Props = {
  file: FileAttachment;
};
