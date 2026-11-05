package com.openmausbot.companion.core

import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals

class L10nTest {
    @Test
    fun `english locale keeps the source sentence`() {
        val previous = Locale.getDefault()
        Locale.setDefault(Locale.US)
        try {
            assertEquals("Cancel", L10n.s("Cancel"))
            assertEquals("Not in the catalog", L10n.s("Not in the catalog"))
        } finally {
            Locale.setDefault(previous)
        }
    }

    @Test
    fun `korean locale uses the korean pack`() {
        val previous = Locale.getDefault()
        Locale.setDefault(Locale.KOREAN)
        try {
            assertEquals("취소", L10n.s("Cancel"))
            assertEquals("설정", L10n.s("Settings"))
            assertEquals(
                "이 네트워크를 검색하려면 주변 기기 권한이 필요해요. 아직 꺼져 있어요. QR 코드와 아래 주소는 그 권한 없이도 쓸 수 있어요.",
                L10n.s(
                    "Searching this network needs %s, which is still off. The QR code and the address below work without it.",
                    "주변 기기",
                ),
            )
            assertEquals("Not in the catalog", L10n.s("Not in the catalog"))
        } finally {
            Locale.setDefault(previous)
        }
    }
}
