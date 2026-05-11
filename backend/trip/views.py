from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .hos_calculator import HosCalculationError, calculate_trip


class PlanTripInputSerializer(serializers.Serializer):
    current_location = serializers.CharField()
    pickup_location = serializers.CharField()
    dropoff_location = serializers.CharField()
    cycle_used_hours = serializers.FloatField(min_value=0)


class PlanTripView(APIView):
    def post(self, request):
        serializer = PlanTripInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        try:
            result = calculate_trip(
                current_location=data["current_location"],
                pickup_location=data["pickup_location"],
                dropoff_location=data["dropoff_location"],
                cycle_used_hours=float(data["cycle_used_hours"]),
            )
        except HosCalculationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)
