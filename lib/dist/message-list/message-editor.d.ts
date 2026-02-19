/// <reference types="react" />
import { MessageEnvelope } from "../types";
declare const MessageEditor: ({ onSubmit, envelope }: Props) => JSX.Element;
export default MessageEditor;
declare type Props = {
    onSubmit?: (value: string) => void;
    envelope: MessageEnvelope;
};
