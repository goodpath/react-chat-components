import React from "react";
import { FileAttachment } from "../types";
export declare const ImageMessage: React.MemoExoticComponent<({ file, scrolledBottom, scrollToBottom }: Props) => JSX.Element>;
declare type Props = {
    file: FileAttachment;
    scrolledBottom: boolean;
    scrollToBottom: () => void;
};
export {};
