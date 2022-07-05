import React, { memo, useCallback, useMemo, useState } from "react";
import SpinnerIcon from "../icons/spinner.svg";
import { FileAttachment } from "../types";

export const ImageMessage = memo(({ file, scrolledBottom, scrollToBottom }: Props) => {
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

    if (scrolledBottom) scrollToBottom();
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
});

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
  scrolledBottom: boolean;
  scrollToBottom: () => void;
};
