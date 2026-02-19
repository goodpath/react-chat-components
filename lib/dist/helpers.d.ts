import { MutableRefObject, MouseEvent } from "react";
import { MessageEnvelope } from "./types";
export declare const getNameInitials: (name: string) => string;
export declare const getPredefinedColor: (uuid: string) => string;
export declare const useOuterClick: (callback: (e: MouseEvent) => unknown) => MutableRefObject<HTMLDivElement>;
export declare const getLastMessageUpdate: (envelope: MessageEnvelope) => string;
