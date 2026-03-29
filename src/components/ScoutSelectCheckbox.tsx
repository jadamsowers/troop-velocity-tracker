import React from "react";

interface Props {
  userId: number;
  checked: boolean;
  onChange: (userId: number, selected: boolean) => void;
}

export const ScoutSelectCheckbox: React.FC<Props> = ({
  userId,
  checked,
  onChange,
}) => (
  <input
    type="checkbox"
    checked={checked}
    onChange={(e) => onChange(userId, e.target.checked)}
    className="scout-checkbox"
    title="Select for comparison"
    aria-label="Select scout for comparison"
  />
);
