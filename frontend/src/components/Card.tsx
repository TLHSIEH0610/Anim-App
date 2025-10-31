import React from "react";
import { StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Surface } from "react-native-paper";
import { radii, shadow, spacing } from "../styles/theme";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const Card: React.FC<CardProps> = ({ children, style }) => {
  return (
    <Surface style={[styles.card, style]} elevation={0}>
      {children}
    </Surface>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    padding: spacing(2),
    backgroundColor: "rgba(0,0,0,0.1)",
  },
});

export default Card;
