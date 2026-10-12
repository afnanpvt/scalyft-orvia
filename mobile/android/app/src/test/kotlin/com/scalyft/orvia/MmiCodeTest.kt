package com.scalyft.orvia

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MmiCodeTest {

    @Test
    fun acceptsTheCodesTheAppSends() {
        listOf(
            "**21*+919876543210#",
            "**67*+14155550100#",
            "**61*+14155550100**20#",
            "**62*919876543210#",
            "##21#", "##67#", "##61#", "##62#", "##002#", "##004#",
            "*#21#", "*#61#",
        ).forEach { assertTrue("should accept $it", MmiCode.isValid(it)) }
    }

    @Test
    fun refusesAPlainPhoneNumber() {
        assertFalse(MmiCode.isValid("+919876543210"))
        assertFalse(MmiCode.isValid("100"))
        assertFalse(MmiCode.isValid("112"))
    }

    @Test
    fun refusesAnythingThatCouldChainOrHide() {
        listOf(
            "**21*+9198;123#",     // semicolon
            "**21*+91 98#",        // space
            "**21*+91,98#",        // comma = dial pause
            "**21*abc#",           // letters
            "**21*+919876543210",  // no trailing #
            "21*+919876543210#",   // no leading * or #
            "**21*+919876543210#\n*#06#",
            "tel:**21*1#",
        ).forEach { assertFalse("should refuse $it", MmiCode.isValid(it)) }
    }

    @Test
    fun refusesNullEmptyAndOversized() {
        assertFalse(MmiCode.isValid(null))
        assertFalse(MmiCode.isValid(""))
        assertFalse(MmiCode.isValid("*#"))
        assertFalse(MmiCode.isValid("**21*" + "9".repeat(80) + "#"))
    }
}
