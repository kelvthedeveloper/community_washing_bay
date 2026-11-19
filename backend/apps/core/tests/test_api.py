from django.test import SimpleTestCase


class ApiVersioningAndDocumentationTests(SimpleTestCase):
    def test_api_schema_is_available_under_v1(self):
        response = self.client.get("/api/v1/schema/")

        self.assertEqual(response.status_code, 200)

    def test_api_schema_documents_actual_auth_and_account_responses(self):
        response = self.client.get(
            "/api/v1/schema/",
            HTTP_ACCEPT="application/vnd.oai.openapi+json",
        )
        schema = response.json()
        paths = schema["paths"]

        self.assertEqual(response.status_code, 200)
        login_response = paths["/api/v1/auth/token/"]["post"]["responses"]["200"]
        login_schema = login_response["content"]["application/json"]["schema"]["$ref"]
        login_properties = schema["components"]["schemas"][login_schema.rsplit("/", 1)[-1]][
            "properties"
        ]
        self.assertEqual(set(login_properties), {"access", "refresh"})

        logout_response = paths["/api/v1/auth/token/logout/"]["post"]["responses"][
            "204"
        ]
        self.assertNotIn("content", logout_response)

        password_response = paths["/api/v1/auth/password/change/"]["post"][
            "responses"
        ]["200"]
        password_schema = password_response["content"]["application/json"]["schema"][
            "$ref"
        ]
        password_properties = schema["components"]["schemas"][
            password_schema.rsplit("/", 1)[-1]
        ]["properties"]
        self.assertEqual(set(password_properties), {"detail"})

        create_response = paths["/api/v1/users/"]["post"]["responses"]["201"]
        create_schema = create_response["content"]["application/json"]["schema"][
            "$ref"
        ]
        create_properties = schema["components"]["schemas"][
            create_schema.rsplit("/", 1)[-1]
        ]["properties"]
        self.assertNotIn("password", create_properties)
        self.assertIn("id", create_properties)

    def test_swagger_documentation_is_available_under_v1(self):
        response = self.client.get("/api/v1/docs/")

        self.assertEqual(response.status_code, 200)

    def test_unsupported_api_versions_are_rejected(self):
        response = self.client.get("/api/v2/schema/")

        self.assertEqual(response.status_code, 404)
