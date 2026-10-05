package com.pakkabill.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** The website's "How to use" guide: 10 steps with pictures (SVG) and what each option means. */
class Guide(val steps: List<Step>, val terms: List<Term>, val ui: Map<String, Map<String, String>>, val art: Map<String, String>) {
    class Step(val art: String, val en: Pair<String, String>, val hi: Pair<String, String>)
    class Term(val en: String, val hi: String, val enText: String, val hiText: String)

    companion object {
        fun parse(text: String): Guide {
            val o = json.parseToJsonElement(text).jsonObject
            fun pair(a: JsonArray) = a[0].jsonPrimitive.content to a[1].jsonPrimitive.content
            val steps = o["steps"]?.jsonArray?.map { s ->
                val so = s.jsonObject
                Step(so["art"]!!.jsonPrimitive.content, pair(so["en"]!!.jsonArray), pair(so["hi"]!!.jsonArray))
            }.orEmpty()
            val terms = o["terms"]?.jsonArray?.map { t ->
                val a = t.jsonArray
                Term(a[0].jsonPrimitive.content, a[1].jsonPrimitive.content, a[2].jsonPrimitive.content, a[3].jsonPrimitive.content)
            }.orEmpty()
            val ui = o["ui"]?.jsonObject?.mapValues { (_, v) -> v.jsonObject.mapValues { it.value.jsonPrimitive.content } }.orEmpty()
            val art = o["art"]?.jsonObject?.mapValues { it.value.jsonPrimitive.content }.orEmpty()
            return Guide(steps, terms, ui, art)
        }
    }
}
