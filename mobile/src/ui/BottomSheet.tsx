// Alt sayfa (DESIGN.md §3): surface-1, üst köşe radius-lg, iç boşluk space-5,
// arka overlay, shadow-raised, üstte 36×4 tutamaç line-strong. Web'de de çalışır
// (RN Modal web'de mutlak konumlu bir katman çizer).
import React from 'react';
import { tr } from '../i18n';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Üstte title-18 başlık (isteğe bağlı). */
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({ visible, onClose, title, children }: BottomSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Arka plana dokununca kapanır; ekran okuyucuda "Kapat". */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('Kapat')}
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.colors.overlay }}
        />
        <View
          style={[
            {
              backgroundColor: t.colors.surface1,
              borderTopLeftRadius: t.radius.lg,
              borderTopRightRadius: t.radius.lg,
              paddingHorizontal: t.space[5],
              paddingTop: t.space[3],
              paddingBottom: t.space[5] + insets.bottom,
              width: '100%',
              maxWidth: t.size.maxContentWidth,
              alignSelf: 'center',
              maxHeight: '90%',
            },
            t.shadowRaised,
          ]}
        >
          <View
            accessibilityElementsHidden
            style={{
              width: t.size.sheetHandleWidth,
              height: t.size.sheetHandleHeight,
              borderRadius: t.radius.full,
              backgroundColor: t.colors.lineStrong,
              alignSelf: 'center',
              marginBottom: t.space[3],
            }}
          />
          {title ? (
            <Text accessibilityRole="header" style={[t.type.title18, { color: t.colors.ink, marginBottom: t.space[3] }]}>
              {title}
            </Text>
          ) : null}
          <ScrollView contentContainerStyle={{ gap: t.space[3] }}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}
