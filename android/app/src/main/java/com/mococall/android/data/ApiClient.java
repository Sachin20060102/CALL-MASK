package com.mococall.android.data;

import com.google.gson.Gson;
import com.mococall.android.BuildConfig;
import com.mococall.android.data.model.ApiModels;
import java.io.IOException;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.ResponseBody;
import retrofit2.Response;
import retrofit2.Retrofit;
import retrofit2.converter.gson.GsonConverterFactory;

public final class ApiClient {
    private static final Gson GSON = new Gson();

    private ApiClient() {}

    public static MocoCallApi create(SessionManager sessionManager) {
        OkHttpClient client = new OkHttpClient.Builder()
                .addInterceptor(chain -> {
                    Request original = chain.request();
                    String token = sessionManager.getAccessToken();
                    if (token == null || token.isEmpty()) {
                        return chain.proceed(original);
                    }
                    Request authed = original.newBuilder()
                            .header("Authorization", "Bearer " + token)
                            .build();
                    return chain.proceed(authed);
                })
                .build();

        Retrofit retrofit = new Retrofit.Builder()
                .baseUrl(BuildConfig.API_BASE_URL)
                .client(client)
                .addConverterFactory(GsonConverterFactory.create(GSON))
                .build();

        return retrofit.create(MocoCallApi.class);
    }

    public static String parseErrorMessage(Response<?> response, String fallback) {
        ResponseBody errBody = response.errorBody();
        if (errBody == null) return fallback;
        try {
            String raw = errBody.string();
            ApiModels.ApiErrorBody parsed = GSON.fromJson(raw, ApiModels.ApiErrorBody.class);
            if (parsed != null && parsed.error != null && parsed.error.message != null) {
                return parsed.error.message;
            }
        } catch (IOException ignored) {
            return fallback;
        }
        return fallback;
    }
}
