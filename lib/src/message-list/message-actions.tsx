import React from "react";
import { AiFillEdit as EditIcon } from "react-icons/ai";
import { RiDeleteBin6Line as DeleteIcon } from "react-icons/ri";

const MessageActions = ({ canEdit, onEdit, canDelete, onDelete }: Props) => {
  return (
    <>
      {canEdit && onEdit && <Action icon={EditIcon} action={onEdit} />}
      {canDelete && onDelete && <Action icon={DeleteIcon} action={onDelete} />}
    </>
  );
};

const Action = (props) => {
  const Icon = props.icon;
  const action = props.action;
  const [hover, setHover] = React.useState(false);

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={action}>
      <Icon color={hover ? "#de2440" : "#999999"} style={{ padding: "0.125rem" }} />
    </div>
  );
};

export default MessageActions;

type Props = {
  canEdit?: boolean;
  canDelete?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
};
