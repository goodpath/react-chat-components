import React from "react";
import { FileAttachment } from "../types";
export declare const FileRenderer: React.MemoExoticComponent<({ file, scrollToBottom, scrolledBottom }: Props) => JSX.Element>;
declare type Props = {
    file: FileAttachment;
    scrolledBottom: boolean;
    scrollToBottom: () => void;
};
export {};
