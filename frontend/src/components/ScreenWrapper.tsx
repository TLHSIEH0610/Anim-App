import React from "react";
import { View, StyleSheet, Image, Dimensions, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

const { width, height } = Dimensions.get("window");

interface ScreenWrapperProps {
  children: React.ReactNode;
  showIllustrations?: boolean;
  footer?: React.ReactNode;
}

const ScreenWrapper: React.FC<ScreenWrapperProps> = ({
  children,
  showIllustrations = false,
  footer,
}) => {
  return (
    <LinearGradient
      colors={["#87CEEB", "#FFE4B5"]} // Light sky blue to Moccasin
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
  //       colors={['#1A224A', '#2E3B72', '#A88A4E']} // Darkest blue, mid-blue, golden-brown
  // locations={[0, 0.5, 1]} // Corresponds to the colors array
  // start={{ x: 0, y: 0 }} // Top-left
  // end={{ x: 0, y: 1 }} // Bottom-left (vertical gradient)
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        {showIllustrations && (
          <>
            <Image
              source={require("../../assets/castle_outline.png")}
              style={styles.backgroundCastle}
            />
            <Image
              source={require("../../assets/stars_scatter.png")}
              style={styles.backgroundStars}
            />
            <Image
              source={require("../../assets/cloud.png")}
              style={styles.backgroundCloud}
            />
          </>
        )}
        <View style={[styles.contentContainer, footer ? styles.contentWithFooter : null]}>
          {children}
        </View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    position: "relative",
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 15,
  },
  contentWithFooter: {
  },
  footer: {
    alignSelf: "stretch",
  },
  backgroundCastle: {
    position: "absolute",
    width: width * 0.7,
    height: height * 0.3,
    resizeMode: "contain",
    opacity: 0.3,
    bottom: height * 0.3,
    right: -width * 0.1,
  },
  backgroundStars: {
    position: "absolute",
    width: width * 0.5,
    height: height * 0.2,
    resizeMode: "contain",
    opacity: 0.6,
    bottom: height * 0.2,
    left: -width * 0.1,
    transform: [{ rotate: "15deg" }],
  },
  backgroundCloud: {
    position: "absolute",
    width: width * 0.5,
    height: height * 0.2,
    resizeMode: "contain",
    opacity: 0.6,
    top: height * 0.2,
    left: -width * 0.1,
    transform: [{ rotate: "15deg" }],
  },
});

export default ScreenWrapper;
