import React, { useState } from "react";
import styled from "styled-components";
import { getLastMessageUpdate } from "../helpers";
import { MessageEnvelope, StandardMessage } from "../types";

const Div = styled.div`
  display: flex;
  justify-content: space-between;
  width: 90%;
`;

const Button = styled.button`
  padding-left: 1rem;
  background: "#5babfc" !important;
  border-radius: 10%;
  padding-right: 1rem;
`;

const MessageEditor = ({ onSubmit = () => {}, envelope }: Props) => {
  const [value, setValue] = useState("");

  console.log("asdfasdf", envelope);

  React.useEffect(() => {
    const editedText = getLastMessageUpdate(envelope);
    setValue(editedText || (envelope.message as StandardMessage).text);
  }, [envelope?.message]);
  return (
    <Div>
      <textarea style={styles.textarea} value={value} onChange={(e) => setValue(e.target.value)} />
      <Button onClick={() => onSubmit(value)}>Submit</Button>
    </Div>
  );
};

export default MessageEditor;

type Props = {
  onSubmit?: (value: string) => void;
  envelope: MessageEnvelope;
};

const styles = {
  textarea: { width: "100%", padding: "0.25rem" },
};
