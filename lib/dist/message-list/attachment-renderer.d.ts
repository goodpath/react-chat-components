/// <reference types="react" />
import { ImageAttachment, LinkAttachment } from "../types";
export declare const AttachmentRenderer: ({ attachment }: Props) => JSX.Element;
declare type Props = {
    attachment: ImageAttachment | LinkAttachment;
};
export {};
