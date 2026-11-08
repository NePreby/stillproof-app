import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, type as t, useTheme } from '../theme';
import { EdgeLabel, Rule } from './ui';

/** The stack header: a back control set as an edge label, the title in Gloock, a hairline. */
export function Header({ navigation, options, back, route }: NativeStackHeaderProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const title = options.title ?? route.name;
  const right = options.headerRight?.({ canGoBack: !!back, tintColor: c.text });
  return (
    <View style={{ backgroundColor: c.bg, paddingTop: insets.top + space[2] }}>
      <View style={styles.bar}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Back to ${back.title ?? 'the previous screen'}`}
            onPress={navigation.goBack}
            hitSlop={12}
          >
            <EdgeLabel style={{ color: c.text }}>← Back</EdgeLabel>
          </Pressable>
        ) : (
          <EdgeLabel>Stillproof</EdgeLabel>
        )}
        {right}
      </View>
      <Text accessibilityRole="header" style={[t.display, styles.title, { color: c.text }]}>
        {title}
      </Text>
      <Rule />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 32,
    paddingHorizontal: space[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { paddingHorizontal: space[4], paddingTop: space[1], paddingBottom: space[3] },
});
