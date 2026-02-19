/// <reference types="react" />
declare const MessageActions: ({ canEdit, onEdit, canDelete, onDelete }: Props) => JSX.Element;
export default MessageActions;
declare type Props = {
    canEdit?: boolean;
    canDelete?: boolean;
    onEdit?: () => void;
    onDelete?: () => void;
};
