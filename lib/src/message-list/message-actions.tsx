import React from "react";
import { AiFillEdit as EditIcon } from "react-icons/ai";

const MessageActions = ({ canEdit, onEdit = () => {} }) => {
  const [hover, setHover] = React.useState(false);

  return (
    <>
      {canEdit && (
        <div
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onClick={onEdit}
        >
          <EditIcon color={hover ? "#de2440" : "#999999"} style={{ padding: "0.125rem" }} />
        </div>
      )}
    </>
  );
};

export default MessageActions;
