import React, { useState, useContext, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SocketContext } from "../../../contexts/socket.context";
import { COLOR } from "../../../constants/color";

const PlayerInfos = () => {
  const socket = useContext(SocketContext);
  const [playerInfos, setPlayerInfos] = useState({});

  useEffect(() => {
    socket.on("game.players-infos.view-state", (data) => {
      setPlayerInfos(data["playerInfos"]);
    });
  }, []);
  return (
    <View style={styles.playerInfosContainer}>
      <Text style={{ color: COLOR.WHITE }}>
        {playerInfos.playerKey} component
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  playerInfosContainer: {
    flex: 6,
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderColor: "black",
    backgroundColor: COLOR.DARK_GREEN,
  },
});

export default PlayerInfos;
