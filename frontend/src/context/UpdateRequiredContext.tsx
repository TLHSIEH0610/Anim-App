import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { onUpdateRequired, UpdateRequiredInfo } from "../lib/updateEvents";
import UpdateRequiredScreen from "../screens/UpdateRequiredScreen";

interface UpdateRequiredContextValue {
  info: UpdateRequiredInfo | null;
}

const UpdateRequiredContext = createContext<UpdateRequiredContextValue | undefined>(undefined);

export const useUpdateRequired = (): UpdateRequiredContextValue => {
  const ctx = useContext(UpdateRequiredContext);
  if (!ctx) {
    throw new Error("useUpdateRequired must be used within an UpdateRequiredProvider");
  }
  return ctx;
};

interface Props {
  children: ReactNode;
}

export const UpdateRequiredProvider: React.FC<Props> = ({ children }) => {
  const [info, setInfo] = useState<UpdateRequiredInfo | null>(null);

  useEffect(() => {
    const unsubscribe = onUpdateRequired((payload) => {
      setInfo((prev) => prev || payload);
    });
    return unsubscribe;
  }, []);

  const value = useMemo<UpdateRequiredContextValue>(
    () => ({ info }),
    [info]
  );

  if (info) {
    return (
      <UpdateRequiredContext.Provider value={value}>
        <UpdateRequiredScreen info={info} />
      </UpdateRequiredContext.Provider>
    );
  }

  return (
    <UpdateRequiredContext.Provider value={value}>
      {children}
    </UpdateRequiredContext.Provider>
  );
};

