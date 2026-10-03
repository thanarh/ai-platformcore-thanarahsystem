import unittest
from unittest.mock import AsyncMock, patch

from app.models.chat import ChatMessage, ChatRequest, RouteDecision
from app.router.intelligence_router import IntelligenceRouter
from app.web_intelligence.decision import WebDecision
from app.web_intelligence.pipeline import WebPipelineResult


class ExplicitWebSearchTests(unittest.IsolatedAsyncioTestCase):
    async def test_provider_only_search_request_asks_for_a_topic_in_both_routes(self):
        router = IntelligenceRouter(registry=None)
        normal_request = ChatRequest(
            messages=[ChatMessage(role="user", content="ابحث في جوجل")],
            tenantId="tenant-a",
            runtimeContext={"language": "ar"},
        )
        streaming_request = ChatRequest(
            messages=[ChatMessage(role="user", content="ابحث في جوجل")],
            tenantId="tenant-a",
            runtimeContext={"language": "ar"},
            stream=True,
        )

        with patch.object(
            router,
            "_load_web_context",
            new_callable=AsyncMock,
        ) as load_web:
            normal_response = await router.route(normal_request)
            stream, stream_route, sources, _telemetry, events = await router.stream_route(
                streaming_request
            )
            streamed_content = "".join([part async for part in stream])

        self.assertEqual(normal_response.backend, "clarification")
        self.assertEqual(normal_response.content, "ما الموضوع الذي تريد البحث عنه؟")
        self.assertEqual(stream_route.backend_id, "clarification")
        self.assertEqual(streamed_content, normal_response.content)
        self.assertEqual(sources, [])
        self.assertEqual(events, [])
        load_web.assert_not_awaited()

    async def test_unverified_rankings_and_recent_car_specs_do_not_use_model_fallback(self):
        router = IntelligenceRouter(registry=None)
        ranking_query = "ابحث عن احسن الجامعات في العالم"
        vehicle_query = "الفرق بين الأكسنت ٢٠٢٦ والكرولا ٢٠٢٦"
        ranking_result = WebPipelineResult(
            decision=WebDecision(
                True,
                "web_signal_detected",
                ("university_ranking_request",),
                "general",
            ),
            sources=[],
        )
        vehicle_result = WebPipelineResult(
            decision=WebDecision(
                True,
                "web_signal_detected",
                ("time_sensitive_information", "current_vehicle_model_query"),
                "general",
            ),
            sources=[],
        )

        self.assertFalse(
            router._can_use_general_knowledge_after_web_failure(
                ranking_query,
                ranking_result,
            )
        )
        self.assertFalse(
            router._can_use_general_knowledge_after_web_failure(
                vehicle_query,
                vehicle_result,
            )
        )
        self.assertIn(
            "QS أو THE أو ARWU",
            router._web_unavailable_message(ranking_query, "No verified web search results"),
        )
        self.assertIn(
            "السوق والفئة",
            router._web_unavailable_message(
                vehicle_query,
                "No verified web search results",
                requires_current_source=True,
            ),
        )

    async def test_underspecified_car_comparison_asks_for_details_in_both_routes(self):
        query = "أيهما أفضل، محرك مرسيدس أم BMW؟"
        router = IntelligenceRouter(registry=None)
        normal_request = ChatRequest(
            messages=[ChatMessage(role="user", content=query)],
            tenantId="tenant-a",
            runtimeContext={"language": "ar"},
        )
        streaming_request = ChatRequest(
            messages=[ChatMessage(role="user", content=query)],
            tenantId="tenant-a",
            runtimeContext={"language": "ar"},
            stream=True,
        )

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch.object(
                router,
                "_decide_route",
                return_value=RouteDecision(backend_id="fixture", reason="test"),
            ),
            patch.object(
                router,
                "_load_context_sources",
                new_callable=AsyncMock,
                return_value=([], [], {}),
            ),
            patch.object(
                router,
                "_load_web_context",
                new_callable=AsyncMock,
            ) as web_loader,
        ):
            response = await router.route(normal_request)
            stream, stream_route, _sources, _telemetry, _events = await router.stream_route(
                streaming_request
            )
            streamed_content = "".join([part async for part in stream])

        self.assertEqual(response.backend, "clarification")
        self.assertIn("اسمَي الطرازين", response.content)
        self.assertEqual(stream_route.backend_id, "clarification")
        self.assertIn("اسمَي الطرازين", streamed_content)
        web_loader.assert_not_awaited()

    def test_specific_car_models_and_years_are_allowed_to_search(self):
        query = "ما الفرق بين محرك مرسيدس C200 2022 ومحرك BMW 320i 2022؟"
        self.assertIsNone(IntelligenceRouter._car_comparison_clarification(query))
        broad_current_year = "أيهما أفضل، مرسيدس أم BMW في 2026؟"
        clarification = IntelligenceRouter._car_comparison_clarification(
            broad_current_year
        )
        self.assertIsNotNone(clarification)
        self.assertIn("اسمَي الطرازين", clarification)

    def test_motorcycle_comparison_without_model_years_asks_before_search(self):
        query = "ما الفرق بين Yamaha R3 و Yamaha R6؟"
        clarification = IntelligenceRouter._car_comparison_clarification(query)
        self.assertIsNotNone(clarification)
        self.assertIn("اسمَي الطرازين", clarification)
        self.assertIn("سنة الصنع", clarification)

    def test_uncited_web_draft_is_not_presented_as_a_verified_answer(self):
        sources = [{"id": "source-1"}, {"id": "source-2"}]
        self.assertIsNone(
            IntelligenceRouter._source_linked_web_content(
                "يسبب ذلك التهاب البنكرياس.",
                sources,
            )
        )
        self.assertIsNone(
            IntelligenceRouter._source_linked_web_content(
                "The source says this. [source-99]",
                sources,
            )
        )
        self.assertEqual(
            IntelligenceRouter._source_linked_web_content(
                "تذكر الصفحة وجود مخاطر تنفسية. [source-1]",
                sources,
            ),
            "تذكر الصفحة وجود مخاطر تنفسية. [source-1]",
        )
        self.assertEqual(
            IntelligenceRouter._source_linked_web_content(
                "ملخص من المصادر:\n"
                "قد تكون هناك أضرار. [source-99]\n"
                "تذكر الصفحة وجود مخاطر تنفسية. [source-1]",
                sources,
            ),
            "تذكر الصفحة وجود مخاطر تنفسية. [source-1]",
        )

    async def test_selected_chat_skill_reaches_the_search_pipeline_as_explicit(self):
        result = WebPipelineResult(
            decision=WebDecision(True, "web_signal_detected", ("explicit_tool_selection",), "general"),
            sources=[{"id": "source-1", "title": "Result"}],
        )
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="What is new in Python?")],
            tenantId="tenant-a",
            userId="user-a",
            conversationId="conversation-a",
            runtimeContext={"language": "en"},
            skillId="web_search",
        )
        async def progress_callback(_event):
            return None

        with patch(
            "app.router.intelligence_router.web_intelligence_pipeline.run",
            new_callable=AsyncMock,
            return_value=result,
        ) as run:
            loaded = await IntelligenceRouter(registry=None)._load_web_context(
                request,
                event_callback=progress_callback,
            )

        self.assertIs(loaded, result)
        self.assertTrue(run.await_args.kwargs["explicit_request"])
        self.assertIs(run.await_args.kwargs["event_callback"], progress_callback)
        self.assertEqual(run.await_args.args[0], "What is new in Python?")
        self.assertRegex(run.await_args.kwargs["as_of_date"], r"^\d{4}-\d{2}-\d{2}$")

    async def test_topic_reply_after_search_clarification_inherits_search_intent(self):
        topic = "عن احسن سيارة لي 2026"
        request = ChatRequest(
            messages=[
                ChatMessage(role="user", content="ابحث في جوجل"),
                ChatMessage(role="assistant", content="ما الموضوع الذي تريد البحث عنه؟"),
                ChatMessage(role="user", content=topic),
            ],
            tenantId="tenant-a",
            runtimeContext={"language": "ar"},
        )
        result = WebPipelineResult(
            decision=WebDecision(True, "web_signal_detected", ("explicit_tool_selection",), "general"),
        )

        with patch(
            "app.router.intelligence_router.web_intelligence_pipeline.run",
            new_callable=AsyncMock,
            return_value=result,
        ) as run:
            loaded = await IntelligenceRouter(registry=None)._load_web_context(request)

        self.assertIs(loaded, result)
        self.assertTrue(run.await_args.kwargs["explicit_request"])
        self.assertEqual(run.await_args.args[0], topic)

    async def test_search_topic_followup_bypasses_cache_in_both_routes(self):
        topic = "عن احسن سيارة لي 2026"
        messages = [
            ChatMessage(role="user", content="ابحث في جوجل"),
            ChatMessage(role="assistant", content="ما الموضوع الذي تريد البحث عنه؟"),
            ChatMessage(role="user", content=topic),
        ]
        web_result = WebPipelineResult(
            decision=WebDecision(
                True,
                "web_signal_detected",
                ("explicit_tool_selection", "time_sensitive_information", "current_vehicle_model_query"),
                "general",
            ),
        )
        route_decision = RouteDecision(
            backend_id="thanarah-local",
            reason="Test route",
            rag_enabled=False,
            fallback_order=[],
        )

        for streaming in (False, True):
            request = ChatRequest(
                messages=messages,
                tenantId="tenant-a",
                userId="user-a",
                conversationId="conversation-a",
                runtimeContext={"language": "ar"},
            )
            router = IntelligenceRouter(registry=None)
            with (
                patch.object(
                    router,
                    "_load_context_sources",
                    new_callable=AsyncMock,
                    return_value=([], [], None),
                ),
                patch.object(router, "_decide_route", return_value=route_decision),
                patch(
                    "app.router.intelligence_router.daily_learning_service.profile",
                    new_callable=AsyncMock,
                    return_value=None,
                ),
                patch(
                    "app.router.intelligence_router.web_intelligence_pipeline.run",
                    new_callable=AsyncMock,
                    return_value=web_result,
                ) as run,
                patch(
                    "app.router.intelligence_router.response_cache_service.get",
                    new_callable=AsyncMock,
                    return_value=None,
                ) as cache_get,
                patch(
                    "app.router.intelligence_router.response_cache_service.store",
                    new_callable=AsyncMock,
                ) as cache_store,
            ):
                if streaming:
                    stream, *_ = await router.stream_route(request)
                    "".join([part async for part in stream])
                else:
                    await router.route(request)

            cache_get.assert_not_awaited()
            cache_store.assert_not_awaited()
            run.assert_awaited_once()
            self.assertTrue(run.await_args.kwargs["explicit_request"])
            self.assertEqual(run.await_args.args[0], topic)

    def test_search_topic_followup_requires_the_immediate_search_clarification(self):
        router = IntelligenceRouter(registry=None)
        valid_followup = ChatRequest(
            messages=[
                ChatMessage(role="user", content="Search Google"),
                ChatMessage(role="assistant", content="What topic would you like me to search for?"),
                ChatMessage(role="user", content="2026 electric cars"),
            ],
        )
        unrelated_followup = ChatRequest(
            messages=[
                ChatMessage(role="user", content="Search Google"),
                ChatMessage(role="assistant", content="What topic would you like me to search for?"),
                ChatMessage(role="assistant", content="I can also help with other questions."),
                ChatMessage(role="user", content="2026 electric cars"),
            ],
        )

        self.assertTrue(router._is_search_topic_followup(valid_followup))
        self.assertTrue(router._has_explicit_search_intent(valid_followup))
        self.assertFalse(router._is_search_topic_followup(unrelated_followup))
        self.assertFalse(router._has_explicit_search_intent(unrelated_followup))

    async def test_explicit_text_search_without_sources_fails_closed_when_web_is_disabled(self):
        web_result = WebPipelineResult(
            decision=WebDecision(
                False,
                "disabled_by_environment",
                ("explicit_search_request",),
                "general",
            ),
        )
        generated_requests = []

        class FakeBackend:
            default_model = "fixture"

            async def stream_chat(self, ai_request):
                generated_requests.append(ai_request)
                yield "An unverified fallback answer."

        class FakeRegistry:
            def get(self, _backend_id):
                return FakeBackend()

        router = IntelligenceRouter(registry=FakeRegistry())
        query = "Search in Google what is the difference between Yamaha R3 and Yamaha R6"

        def make_request(stream=False):
            return ChatRequest(
                messages=[ChatMessage(role="user", content=query)],
                tenantId="tenant-a",
                runtimeContext={"language": "en"},
                stream=stream,
            )

        self.assertTrue(router._has_explicit_search_intent(make_request()))

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.router.intelligence_router.response_cache_service.store",
                new_callable=AsyncMock,
            ),
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch.object(
                router,
                "_decide_route",
                return_value=RouteDecision(backend_id="fixture", reason="test"),
            ),
            patch.object(
                router,
                "_load_context_sources",
                new_callable=AsyncMock,
                return_value=([], [], {}),
            ),
            patch.object(
                router,
                "_load_web_context",
                new_callable=AsyncMock,
                return_value=web_result,
            ),
        ):
            normal_response = await router.route(make_request())
            stream, stream_route, *_ = await router.stream_route(make_request(stream=True))
            streamed_content = "".join([part async for part in stream])

        self.assertEqual(normal_response.backend, "web-search-unavailable")
        self.assertEqual(stream_route.backend_id, "web-search-unavailable")
        self.assertTrue(streamed_content)
        self.assertEqual(generated_requests, [])

    async def test_other_selected_skills_do_not_force_web_search(self):
        result = WebPipelineResult(
            decision=WebDecision(False, "no_web_signal", (), "general"),
        )
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="Summarize the last answer")],
            tenantId="tenant-a",
            skillId="summarization",
        )

        with patch(
            "app.router.intelligence_router.web_intelligence_pipeline.run",
            new_callable=AsyncMock,
            return_value=result,
        ) as run:
            await IntelligenceRouter(registry=None)._load_web_context(request)

        self.assertFalse(run.await_args.kwargs["explicit_request"])

    async def test_arabic_query_sets_arabic_search_language_despite_english_runtime_default(self):
        result = WebPipelineResult(
            decision=WebDecision(True, "web_signal_detected", ("time_sensitive_information",), "news"),
        )
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="ما حصل اليوم في السعوديه")],
            tenantId="tenant-a",
            runtimeContext={"language": "en", "timezone": "Asia/Riyadh"},
            skillId="web_search",
        )

        with patch(
            "app.router.intelligence_router.web_intelligence_pipeline.run",
            new_callable=AsyncMock,
            return_value=result,
        ) as run:
            await IntelligenceRouter(registry=None)._load_web_context(request)

        self.assertEqual(run.await_args.kwargs["language"], "ar")
        self.assertEqual(run.await_args.kwargs["timezone_name"], "Asia/Riyadh")

    async def test_web_search_uses_runtime_context_from_tenant_config(self):
        result = WebPipelineResult(
            decision=WebDecision(True, "web_signal_detected", ("time_sensitive_information",), "news"),
        )
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="ما حصل اليوم في مصر")],
            tenantId="tenant-a",
            tenantConfig={
                "runtimeContext": {
                    "timezone": "Asia/Riyadh",
                    "language": "ar",
                    "region": "eg",
                }
            },
        )
        router = IntelligenceRouter(registry=None)

        with patch(
            "app.router.intelligence_router.web_intelligence_pipeline.run",
            new_callable=AsyncMock,
            return_value=result,
        ) as run:
            await router._load_web_context(request)

        self.assertEqual(run.await_args.kwargs["timezone_name"], "Asia/Riyadh")
        self.assertEqual(run.await_args.kwargs["region"], "eg")
        self.assertIn("Timezone: Asia/Riyadh", router._build_context(request))

    def _direct_link_followup_fixture(self, *, stream=False):
        request = ChatRequest(
            messages=[
                ChatMessage(role="user", content="من هم شركة Qirox Studio؟"),
                ChatMessage(role="assistant", content="لا أعرف هذه الشركة."),
                ChatMessage(role="user", content="هذا هو موقعهم الاكتروني qiroxstudio.online"),
            ],
            tenantId="tenant-a",
            runtimeContext={"language": "en"},
            stream=stream,
        )
        web_result = WebPipelineResult(
            decision=WebDecision(True, "web_signal_detected", ("user_provided_url",), "general"),
            context=(
                "## Web evidence\n[source-1] Qirox Studio\n"
                "URL: https://qiroxstudio.online\n"
                "Retrieved: 2026-09-28T00:00:00+00:00\n"
                "Content: كيروكس استوديو — شركة برمجة سعودية في الرياض. "
                "نبني مواقع إلكترونية وتطبيقات جوال وأنظمة إدارة."
            ),
            sources=[{
                "id": "source-1",
                "title": "Qirox Studio",
                "url": "https://qiroxstudio.online",
                "source": "user_provided_url",
            }],
        )
        return request, web_result

    async def test_direct_link_followup_answers_prior_question_from_page_excerpt(self):
        request, web_result = self._direct_link_followup_fixture()
        router = IntelligenceRouter(registry=None)

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch.object(
                router,
                "_decide_route",
                return_value=RouteDecision(backend_id="fixture", reason="test"),
            ),
            patch.object(
                router,
                "_load_context_sources",
                new_callable=AsyncMock,
                return_value=([], [], {}),
            ),
            patch.object(
                router,
                "_load_web_context",
                new_callable=AsyncMock,
                return_value=web_result,
            ),
        ):
            response = await router.route(request)

        self.assertEqual(response.backend, "web-source-summary")
        self.assertIn("شركة برمجة سعودية في الرياض", response.content)
        self.assertIn("نبني مواقع إلكترونية", response.content)
        self.assertIn("[source-1]", response.content)
        self.assertNotIn("لا أعرف", response.content)
        self.assertNotIn("تأسست", response.content)

    async def test_streaming_direct_link_followup_uses_page_excerpt_without_model(self):
        request, web_result = self._direct_link_followup_fixture(stream=True)
        router = IntelligenceRouter(registry=None)

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch.object(
                router,
                "_decide_route",
                return_value=RouteDecision(backend_id="fixture", reason="test"),
            ),
            patch.object(
                router,
                "_load_context_sources",
                new_callable=AsyncMock,
                return_value=([], [], {}),
            ),
            patch.object(
                router,
                "_load_web_context",
                new_callable=AsyncMock,
                return_value=web_result,
            ),
        ):
            stream, route, _sources, _telemetry, _events = await router.stream_route(request)
            answer = "".join([part async for part in stream])

        self.assertEqual(route.backend_id, "web-source-summary")
        self.assertIn("شركة برمجة سعودية في الرياض", answer)
        self.assertIn("[source-1]", answer)

    async def test_stream_does_not_generate_claims_when_web_search_has_no_sources(self):
        web_result = WebPipelineResult(
            decision=WebDecision(True, "web_signal_detected", ("time_sensitive_information",), "news"),
            error="No verified web search results",
        )
        router = IntelligenceRouter(registry=None)
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="ما حصل اليوم في السعوديه")],
            tenantId="tenant-a",
            runtimeContext={"language": "en"},
            stream=True,
        )

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch.object(
                router,
                "_decide_route",
                return_value=RouteDecision(backend_id="fixture", reason="test"),
            ),
            patch.object(
                router,
                "_load_context_sources",
                new_callable=AsyncMock,
                return_value=([], [], {}),
            ),
            patch.object(
                router,
                "_load_web_context",
                new_callable=AsyncMock,
                return_value=web_result,
            ),
        ):
            stream, route, sources, _telemetry, _events = await router.stream_route(request)
            answer = "".join([part async for part in stream])

        self.assertEqual(sources, [])
        self.assertEqual(route.backend_id, "web-search-unavailable")
        self.assertIn("لم يصلني مصدر حديث يمكن التحقق منه الآن", answer)
        self.assertNotIn("الكويت", answer)
        self.assertNotIn("لم أتمكن من العثور على مصادر موثوقة لهذا البحث الآن", answer)

    async def test_non_stream_does_not_generate_claims_when_web_search_has_no_sources(self):
        web_result = WebPipelineResult(
            decision=WebDecision(True, "web_signal_detected", ("time_sensitive_information",), "news"),
            error="No verified web search results",
        )
        router = IntelligenceRouter(registry=None)
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="ما حصل اليوم في السعوديه")],
            tenantId="tenant-a",
            runtimeContext={"language": "en"},
        )

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch.object(
                router,
                "_decide_route",
                return_value=RouteDecision(backend_id="fixture", reason="test"),
            ),
            patch.object(
                router,
                "_load_context_sources",
                new_callable=AsyncMock,
                return_value=([], [], {}),
            ),
            patch.object(
                router,
                "_load_web_context",
                new_callable=AsyncMock,
                return_value=web_result,
            ),
        ):
            response = await router.route(request)

        self.assertIn("لم يصلني مصدر حديث يمكن التحقق منه الآن", response.content)
        self.assertNotIn("الكويت", response.content)
        self.assertEqual(response.backend, "web-search-unavailable")

    async def test_stable_search_without_sources_uses_disclosed_general_knowledge(self):
        web_result = WebPipelineResult(
            decision=WebDecision(
                True,
                "web_signal_detected",
                ("external_factual_lookup",),
                "general",
            ),
            error="No verified web search results",
        )
        generated_requests = []

        class FakeBackend:
            default_model = "fixture"

            async def stream_chat(self, ai_request):
                generated_requests.append(ai_request)
                yield "إجابة عامة من المعرفة العامة."

        backend = FakeBackend()

        class FakeRegistry:
            def get(self, _backend_id):
                return backend

        router = IntelligenceRouter(registry=FakeRegistry())
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="ما اللي حصل في الحرب العالمية الثانية")],
            tenantId="tenant-a",
            runtimeContext={"language": "ar"},
            stream=True,
        )

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.router.intelligence_router.response_cache_service.store",
                new_callable=AsyncMock,
            ),
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch.object(
                router,
                "_decide_route",
                return_value=RouteDecision(backend_id="fixture", reason="test"),
            ),
            patch.object(
                router,
                "_load_context_sources",
                new_callable=AsyncMock,
                return_value=([], [], {}),
            ),
            patch.object(
                router,
                "_load_web_context",
                new_callable=AsyncMock,
                return_value=web_result,
            ),
        ):
            stream, route, _sources, _telemetry, _events = await router.stream_route(request)
            answer = "".join([part async for part in stream])

        self.assertEqual(answer, "إجابة عامة من المعرفة العامة.")
        self.assertEqual(route.backend_id, "fixture")
        self.assertEqual(len(generated_requests), 1)
        self.assertIn("إجابة عامة", generated_requests[0].system_prompt)
        self.assertIn("ليست مبنية على نتائج ويب مباشرة", generated_requests[0].system_prompt)
        self.assertNotIn("لم أتمكن من العثور على مصادر موثوقة لهذا البحث الآن", answer)

    async def test_stream_drops_uncited_drafts_and_keeps_validly_cited_lines(self):
        source = {
            "id": "source-1",
            "title": "Verified source",
            "url": "https://health.example/article",
            "domain": "health.example",
        }
        web_result = WebPipelineResult(
            decision=WebDecision(True, "web_signal_detected", ("explicit_search_request",), "general"),
            context=(
                "## Web evidence\n"
                "[source-1] Verified source\n"
                "URL: https://health.example/article\n"
                "Content: The page describes respiratory risks."
            ),
            sources=[source],
        )
        generated_requests = []

        class FakeBackend:
            default_model = "fixture"

            async def stream_chat(self, ai_request):
                generated_requests.append(ai_request)
                yield "ادعاء غير موثق يجب ألا يظهر.\n"
                yield "تذكر الصفحة مخاطر تنفسية. [source-1]\n"
                yield "تفصيل آخر بلا إحالة.\n"

        backend = FakeBackend()

        class FakeRegistry:
            def get(self, _backend_id):
                return backend

        router = IntelligenceRouter(registry=FakeRegistry())
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="ابحث عن مخاطر التنفس")],
            tenantId="tenant-a",
            runtimeContext={"language": "ar"},
            skillId="web_search",
            stream=True,
        )

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.router.intelligence_router.response_cache_service.store",
                new_callable=AsyncMock,
            ),
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch.object(
                router,
                "_decide_route",
                return_value=RouteDecision(backend_id="fixture", reason="test"),
            ),
            patch.object(
                router,
                "_load_context_sources",
                new_callable=AsyncMock,
                return_value=([], [], {}),
            ),
            patch.object(
                router,
                "_load_web_context",
                new_callable=AsyncMock,
                return_value=web_result,
            ),
        ):
            stream, route, _sources, _telemetry, _events = await router.stream_route(request)
            answer = "".join([part async for part in stream])

        self.assertEqual(route.backend_id, "fixture")
        self.assertEqual(len(generated_requests), 1)
        self.assertIn("تذكر الصفحة مخاطر تنفسية. [source-1]", answer)
        self.assertIn("https://health.example/article", answer)
        self.assertNotIn("ادعاء غير موثق", answer)
        self.assertNotIn("تفصيل آخر بلا إحالة", answer)

    async def test_same_day_news_returns_verified_headlines_without_model(self):
        source = {
            "id": "source-1",
            "title": "عنوان خبر موثوق اليوم",
            "url": "https://news.example/today",
            "domain": "news.example",
            "publishedAt": "2026-09-28T20:00:00Z",
        }
        web_result = WebPipelineResult(
            decision=WebDecision(True, "web_signal_detected", ("time_sensitive_information",), "news"),
            sources=[source],
        )
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="ما اخبار مصر اليوم")],
            tenantId="tenant-a",
            runtimeContext={"language": "ar", "timezone": "Asia/Riyadh"},
        )
        router = IntelligenceRouter(registry=None)

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch.object(
                router,
                "_decide_route",
                return_value=RouteDecision(backend_id="fixture", reason="test"),
            ),
            patch.object(
                router,
                "_load_context_sources",
                new_callable=AsyncMock,
                return_value=([], [], {}),
            ),
            patch.object(
                router,
                "_load_web_context",
                new_callable=AsyncMock,
                return_value=web_result,
            ),
        ):
            response = await router.route(request)

        self.assertEqual(response.backend, "web-news-headlines")
        self.assertIn("عنوان خبر موثوق اليوم", response.content)
        self.assertIn("https://news.example/today", response.content)
        self.assertIn("ليست تغطية شاملة", response.content)

    async def test_stream_same_day_news_returns_verified_headlines_without_model(self):
        source = {
            "id": "source-1",
            "title": "عنوان خبر موثوق اليوم",
            "url": "https://news.example/today",
            "domain": "news.example",
            "publishedAt": "2026-09-28T20:00:00Z",
        }
        web_result = WebPipelineResult(
            decision=WebDecision(True, "web_signal_detected", ("time_sensitive_information",), "news"),
            sources=[source],
        )
        request = ChatRequest(
            messages=[ChatMessage(role="user", content="ما اخبار مصر اليوم")],
            tenantId="tenant-a",
            runtimeContext={"language": "ar", "timezone": "Asia/Riyadh"},
            stream=True,
        )
        router = IntelligenceRouter(registry=None)

        with (
            patch(
                "app.router.intelligence_router.response_cache_service.get",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch(
                "app.router.intelligence_router.daily_learning_service.profile",
                new_callable=AsyncMock,
                return_value=None,
            ),
            patch.object(
                router,
                "_decide_route",
                return_value=RouteDecision(backend_id="fixture", reason="test"),
            ),
            patch.object(
                router,
                "_load_context_sources",
                new_callable=AsyncMock,
                return_value=([], [], {}),
            ),
            patch.object(
                router,
                "_load_web_context",
                new_callable=AsyncMock,
                return_value=web_result,
            ),
        ):
            stream, route, sources, _telemetry, _events = await router.stream_route(request)
            answer = "".join([part async for part in stream])

        self.assertEqual(route.backend_id, "web-news-headlines")
        self.assertEqual(sources, [source])
        self.assertIn("عنوان خبر موثوق اليوم", answer)
        self.assertIn("https://news.example/today", answer)
        self.assertIn("ليست تغطية شاملة", answer)


if __name__ == "__main__":
    unittest.main()