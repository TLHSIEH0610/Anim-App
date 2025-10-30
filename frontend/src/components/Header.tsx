import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { Appbar } from 'react-native-paper';

type HeaderProps = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightActionIcon?: string;
  onRightActionPress?: () => void;
};

export default function Header({ title, subtitle, showBack, onBack, rightActionIcon, onRightActionPress }: HeaderProps) {
  const navigation = useNavigation<any>();
  const handleBack = () => {
    if (onBack) return onBack();
    if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <Appbar.Header>
      {showBack ? <Appbar.BackAction onPress={handleBack} /> : null}
      <Appbar.Content title={title} subtitle={subtitle} />
      {rightActionIcon ? (
        <Appbar.Action icon={rightActionIcon} onPress={onRightActionPress} />
      ) : null}
    </Appbar.Header>
  );
}

